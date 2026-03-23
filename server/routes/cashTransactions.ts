import { Router } from "express";
import { isAuthenticated, requireUser } from "../auth0";
import { storage } from "../storage";
import { insertCashTransactionSchema } from "@shared/schema";

const router = Router();

router.get("/api/cash-transactions", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const portfolioId = req.query.portfolioId as string | undefined;
    const transactions = await storage.getCashTransactions(user.id, portfolioId);
    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/api/cash-transactions", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const data = insertCashTransactionSchema.parse(req.body);
    const transaction = await storage.createCashTransaction(user.id, data);
    res.json(transaction);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/api/cash-transactions/:id", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    await storage.deleteCashTransaction(user.id, req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
