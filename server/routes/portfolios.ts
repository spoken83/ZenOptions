import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, optionalAuth, requireUser, getEffectiveUserId } from "../auth0";
import { insertPortfolioSchema } from "@shared/schema";

const router = Router();

// Portfolio routes (pre-login preview enabled)
router.get("/api/portfolios", optionalAuth, async (req: any, res) => {
  try {
    const userId = await getEffectiveUserId(req);
    const portfolios = await storage.getPortfolios(userId);
    res.json(portfolios);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/api/portfolios/:id", optionalAuth, async (req: any, res) => {
  try {
    const userId = await getEffectiveUserId(req);
    const portfolio = await storage.getPortfolio(userId, req.params.id);
    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }
    res.json(portfolio);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/api/portfolios", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const data = insertPortfolioSchema.parse(req.body);
    const portfolio = await storage.createPortfolio(user.id, data);
    res.json(portfolio);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.patch("/api/portfolios/:id", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const portfolio = await storage.updatePortfolio(user.id, req.params.id, req.body);
    res.json(portfolio);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/api/portfolios/:id", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    await storage.deletePortfolio(user.id, req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
