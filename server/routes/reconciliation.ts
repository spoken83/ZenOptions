import { Router } from "express";
import { isAuthenticated, requireUser } from "../auth0";
import { reconciliationService, type StatementPosition } from "../services/reconciliation";
import { storage } from "../storage";
import multer from "multer";
import path from "path";
import os from "os";

const router = Router();

const upload = multer({
  dest: path.join(os.tmpdir(), 'zenoptions-uploads'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

router.post(
  "/api/reconciliation/upload",
  isAuthenticated,
  upload.single('statement'),
  async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const portfolioId = req.body.portfolioId || undefined;

      const result = await reconciliationService.processStatement(
        req.file.path,
        user.id,
        portfolioId
      );

      res.json(result);
    } catch (error: any) {
      console.error("Reconciliation error:", error);
      res.status(500).json({ message: error.message || "Reconciliation failed" });
    }
  }
);

// Import selected positions from reconciliation into the database
router.post(
  "/api/reconciliation/import",
  isAuthenticated,
  async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;

      const { positions: positionsToImport, portfolioId } = req.body as {
        positions: StatementPosition[];
        portfolioId: string;
      };

      if (!Array.isArray(positionsToImport) || positionsToImport.length === 0) {
        return res.status(400).json({ message: "No positions to import" });
      }

      const created = [];
      const errors = [];

      for (const pos of positionsToImport) {
        try {
          const isLeaps = pos.strategyType === 'LEAPS';
          const isClosed = !!pos.closedAt;

          // Convert entryCredit (dollars per share) to cents
          const entryCreditCents = !isLeaps ? Math.round(pos.entryCredit * 100) : null;
          const entryDebitCents = isLeaps ? Math.round(pos.entryCredit * 100) : null;

          // For closed positions, compute exit from realized P&L
          let exitCreditCents: number | null = null;
          let exitDebitCents: number | null = null;
          if (isClosed && pos.exitCredit != null) {
            if (isLeaps) {
              exitDebitCents = Math.round(pos.exitCredit * 100);
            } else {
              exitCreditCents = Math.round(pos.exitCredit * 100);
            }
          }

          const positionData: any = {
            symbol: pos.symbol,
            portfolioId,
            strategyType: pos.strategyType,
            type: pos.type,
            shortStrike: pos.shortStrike,
            longStrike: pos.longStrike || null,
            callShortStrike: pos.callShortStrike || null,
            callLongStrike: pos.callLongStrike || null,
            contracts: pos.contracts,
            expiry: new Date(pos.expiry),
            entryCreditCents,
            entryDebitCents,
            status: isClosed ? 'closed' : 'open',
            dataSource: 'statement',
            notes: `Imported from broker statement`,
            entryDt: pos.tradeTime ? new Date(pos.tradeTime) : new Date(),
            ...(isClosed && pos.closedAt && { closedAt: new Date(pos.closedAt) }),
            ...(exitCreditCents != null && { exitCreditCents }),
            ...(exitDebitCents != null && { exitDebitCents }),
          };

          const position = await storage.createPosition(user.id, positionData);
          created.push(position);
        } catch (error: any) {
          errors.push({ symbol: pos.symbol, error: error.message });
        }
      }

      res.json({
        success: true,
        imported: created.length,
        errors: errors.length,
        errorDetails: errors.length > 0 ? errors : undefined,
        positions: created,
      });
    } catch (error: any) {
      console.error("Reconciliation import error:", error);
      res.status(500).json({ message: error.message || "Import failed" });
    }
  }
);

export default router;
