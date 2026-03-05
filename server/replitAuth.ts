import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage, initializeUserSettings } from "./storage";
import { DEMO_USER_ID } from "@shared/constants";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  // Adapted for our multi-tenant schema: replitUserId instead of id
  const user = await storage.upsertUser({
    replitUserId: claims["sub"], // Replit user ID goes to replitUserId field
    email: claims["email"],
    name: claims["first_name"] ? `${claims["first_name"]} ${claims["last_name"] || ''}`.trim() : null,
    avatarUrl: claims["profile_image_url"],
  });
  
  // Initialize default settings for new or existing users (idempotent)
  // This ensures settings exist without failing on missing system owner
  try {
    await initializeUserSettings(user.id);
  } catch (error: any) {
    console.error(`⚠️  Error initializing settings for user ${user.id}:`, error.message);
    // Non-fatal - user can still use the app
  }
  
  return user;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    
    const authOptions: any = {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    };
    
    // If login_hint provided (email from form), pass it to pre-fill Replit's auth page
    if (req.query.login_hint) {
      authOptions.login_hint = req.query.login_hint;
    }
    
    passport.authenticate(`replitauth:${req.hostname}`, authOptions)(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

// Optional authentication middleware - doesn't reject unauthenticated requests
// but adds user info to req if authenticated
export const optionalAuth: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return next(); // Continue without user
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    return next(); // Continue without user
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    return next(); // Continue without user
  }
};

// Helper to get cached DB user from session (avoids repeated lookups)
// Returns null if not authenticated
export async function getSessionUser(req: any) {
  const sessionUser = req.user as any;
  
  if (!req.isAuthenticated() || !sessionUser?.claims?.sub) {
    return null;
  }

  // Check if we already cached the DB user on this session
  if (sessionUser.dbUser) {
    return sessionUser.dbUser;
  }

  // Fetch from DB and cache on session
  const dbUser = await storage.getUser(sessionUser.claims.sub);
  if (dbUser) {
    sessionUser.dbUser = dbUser;
  }
  
  return dbUser;
}

// Helper to require authenticated user with cached DB record
// Throws 401 if not authenticated
export async function requireUser(req: any, res: any) {
  const user = await getSessionUser(req);
  
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  
  return user;
}

// Helper to get the effective user ID for data queries
// Returns demo user ID if not authenticated (for pre-login preview)
// Returns authenticated user's ID if logged in
export async function getEffectiveUserId(req: any): Promise<string> {
  const user = await getSessionUser(req);
  return user ? user.id : DEMO_USER_ID;
}

// Check if the request is from an unauthenticated user viewing demo data
export async function isPreLoginMode(req: any): Promise<boolean> {
  const user = await getSessionUser(req);
  return user === null;
}
