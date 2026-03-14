import { Router } from "express";
import { isAuthenticated, requireUser } from "../auth0";
import { reconciliationService } from "../services/reconciliation";
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

export default router;
