import passport from "passport";
import { Strategy as Auth0Strategy } from "passport-auth0";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage, initializeUserSettings } from "./storage";
import { adminNotificationService } from "./services/adminNotification";
import { DEMO_USER_ID } from "@shared/constants";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
    pruneSessionInterval: 60 * 60, // Prune expired sessions every hour
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_LOGIN !== "true", // Not secure when dev-login is enabled
      maxAge: sessionTtl,
    },
  });
}

async function upsertUser(profile: any) {
  // Extract Auth0 user ID
  const auth0UserId = profile.id || profile.user_id;
  if (!auth0UserId) {
    throw new Error("Auth0 user ID is required");
  }

  // Extract email with fallback handling for Auth0 connections that don't provide email
  // (e.g., passwordless, some social providers without email scope)
  let email = profile.emails?.[0]?.value || profile.email;
  if (!email) {
    // Generate a placeholder email using auth0UserId
    // This satisfies the NOT NULL constraint while allowing authentication
    email = `${auth0UserId.replace(/[^a-zA-Z0-9]/g, '_')}@auth0.placeholder`;
    console.warn(`⚠️  No email provided by Auth0, using placeholder: ${email}`);
  }

  // Check if this is a new user before upserting
  const existingUser = await storage.getUser(auth0UserId);
  const isNewUser = !existingUser;

  const user = await storage.upsertUser({
    auth0UserId,
    email,
    name: profile.displayName || profile.name || profile.nickname || email.split('@')[0],
    avatarUrl: profile.picture || profile.photos?.[0]?.value,
  });
  
  // Send admin notification for new user signups
  if (isNewUser) {
    console.log(`🎉 New user signup: ${user.email}`);
    adminNotificationService.notifyNewUserSignup({
      id: user.id,
      email: user.email,
      name: user.name,
    }).catch((error: any) => {
      console.error('Failed to send new user notification:', error.message);
    });
  }
  
  // Initialize default settings for new or existing users (idempotent)
  try {
    await initializeUserSettings(user.id);
  } catch (error: any) {
    console.error(`⚠️  Error initializing settings for user ${user.id}:`, error.message);
    // Non-fatal - user can still use the app
  }
  
  // Ensure user has a default portfolio (idempotent - won't create if one exists)
  try {
    await storage.ensureDefaultPortfolio(user.id, user.name ?? undefined);
  } catch (error: any) {
    console.error(`⚠️  Error ensuring default portfolio for user ${user.id}:`, error.message);
    // Non-fatal - user can create manually in profile
  }
  
  return user;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure Auth0 Strategy
  const strategy = new Auth0Strategy(
    {
      domain: process.env.AUTH0_DOMAIN!,
      clientID: process.env.AUTH0_CLIENT_ID!,
      clientSecret: process.env.AUTH0_CLIENT_SECRET!,
      callbackURL: process.env.AUTH0_CALLBACK_URL || "/api/callback",
    },
    async function (accessToken: string, refreshToken: string, extraParams: any, profile: any, done: any) {
      try {
        const user = await upsertUser(profile);
        // Store only minimal data in session to avoid exceeding Postgres session column limits
        const auth0UserId = profile.id || profile.user_id;
        return done(null, { auth0UserId });
      } catch (error) {
        return done(error);
      }
    }
  );

  passport.use(strategy);

  // Serialize only the Auth0 user ID string to keep session payload minimal
  passport.serializeUser((user: any, cb) => {
    // Extract and store only the auth0UserId string
    cb(null, user.auth0UserId);
  });
  
  // Deserialize by validating auth0UserId exists
  passport.deserializeUser(async (auth0UserId: string, cb) => {
    try {
      // Store minimal session data - actual user will be fetched on demand
      // This prevents errors if user is deleted or database is temporarily unavailable
      cb(null, { auth0UserId });
    } catch (error) {
      cb(error);
    }
  });

  // Login route
  app.get("/api/login", passport.authenticate("auth0", {
    scope: "openid email profile",
  }));

  // Callback route
  app.get("/api/callback",
    passport.authenticate("auth0", {
      failureRedirect: "/"
    }),
    (req, res) => {
      res.redirect("/");
    }
  );

  // Logout route
  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      // Use req.headers.host to include port in development
      const returnTo = `${req.protocol}://${req.headers.host}`;
      const logoutURL = `https://${process.env.AUTH0_DOMAIN}/v2/logout?client_id=${process.env.AUTH0_CLIENT_ID}&returnTo=${encodeURIComponent(returnTo)}`;
      res.redirect(logoutURL);
    });
  });

  // Dev-only: bypass Auth0 and log in as any existing user
  if (process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_LOGIN === "true") {
    app.get("/dev-login", async (req, res) => {
      if (req.headers["cf-ray"]) {
        return res.status(404).send("Not found");
      }
      try {
        const { db } = await import("./db");
        const { users } = await import("@shared/schema");
        const allUsers = await db.select({
          auth0UserId: users.auth0UserId,
          email: users.email,
          name: users.name,
        }).from(users).orderBy(users.email);

        const options = allUsers.map(u =>
          `<option value="${u.auth0UserId}">${u.name ?? u.email} — ${u.email}</option>`
        ).join("");

        res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Dev Login</title>
  <style>
    body { font-family: sans-serif; max-width: 420px; margin: 80px auto; padding: 24px; background: #0f172a; color: #e2e8f0; }
    h2 { margin-bottom: 4px; }
    p { color: #94a3b8; margin-bottom: 20px; font-size: 14px; }
    select, button { width: 100%; padding: 10px; margin: 6px 0; font-size: 15px; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; }
    button { background: #6366f1; border: none; cursor: pointer; font-weight: 600; margin-top: 14px; }
    button:hover { background: #4f46e5; }
    .warn { font-size: 12px; color: #f59e0b; margin-top: 16px; }
  </style>
</head>
<body>
  <h2>Dev Login</h2>
  <p>Select a user to log in as. Development mode only.</p>
  <form method="POST" action="/dev-login">
    <select name="auth0UserId">${options}</select>
    <button type="submit">Log in</button>
  </form>
  <p class="warn">⚠ This page is disabled in production.</p>
</body>
</html>`);
      } catch (err: any) {
        res.status(500).send(`Error loading users: ${err.message}`);
      }
    });

    app.post("/dev-login", async (req, res) => {
      if (req.headers["cf-ray"]) {
        return res.status(404).send("Not found");
      }
      const { auth0UserId } = req.body as { auth0UserId: string };
      if (!auth0UserId) return res.redirect("/dev-login");
      req.login({ auth0UserId }, (err) => {
        if (err) { console.error("Dev login error:", err); return res.redirect("/dev-login"); }
        res.redirect("/");
      });
    });
  }
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};

// Optional authentication middleware - doesn't reject unauthenticated requests
export const optionalAuth: RequestHandler = async (req, res, next) => {
  // Just continue regardless of auth status
  return next();
};

// Helper to get DB user from session
export async function getSessionUser(req: any) {
  if (!req.isAuthenticated() || !req.user) {
    return null;
  }

  const sessionData = req.user as any;
  
  // Session now only stores auth0UserId, fetch user from DB
  if (sessionData.auth0UserId) {
    const dbUser = await storage.getUser(sessionData.auth0UserId);
    return dbUser;
  }
  
  return null;
}

// Helper to require authenticated user with cached DB record
export async function requireUser(req: any, res: any) {
  const user = await getSessionUser(req);
  
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  
  return user;
}

// Helper to get the effective user ID for data queries
export async function getEffectiveUserId(req: any): Promise<string> {
  const user = await getSessionUser(req);
  return user ? user.id : DEMO_USER_ID;
}

// Check if the request is from an unauthenticated user viewing demo data
export async function isPreLoginMode(req: any): Promise<boolean> {
  const user = await getSessionUser(req);
  return user === null;
}
