import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, optionalAuth, requireUser, getSessionUser } from "../auth0";
import { insertSettingSchema, insertFeedbackSchema } from "@shared/schema";
import { telegramService } from "../services/telegram";

const router = Router();

// Settings routes (protected)
router.get("/api/settings", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const settings = await storage.getAllSettings(user.id);
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/api/settings/:key", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const setting = await storage.getSetting(user.id, req.params.key);
    if (!setting) {
      return res.status(404).json({ message: "Setting not found" });
    }
    res.json(setting);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/api/settings", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const data = insertSettingSchema.parse(req.body);
    const setting = await storage.setSetting(user.id, data);
    res.json(setting);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Telegram test endpoint - uses TelegramService
router.post("/api/telegram/test", isAuthenticated, async (req: any, res) => {
  try {
    const sessionUser = await requireUser(req, res);
    if (!sessionUser) return;

    // Fetch fresh user data from database (not cached session)
    const user = await storage.getUserById(sessionUser.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Only Pro users can test Telegram
    if (user.subscriptionTier !== 'pro') {
      return res.status(403).json({ message: "Telegram alerts are only available for Pro users" });
    }

    // Check if user has configured Telegram chat ID
    if (!user.telegramChatId) {
      return res.status(400).json({ message: "Please configure your Telegram chat ID first" });
    }

    // Check if global bot token is configured
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(500).json({ message: "Telegram bot not configured" });
    }

    // Send test message using TelegramService
    await telegramService.sendTestMessage(user.id);

    res.json({ success: true, message: 'Test message sent successfully' });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to send test message',
      error: error.response?.data?.description || error.message
    });
  }
});

// Send all active alerts via Telegram (protected)
router.post("/api/telegram/send-alerts", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const alerts = await storage.getActiveAlerts(user.id);
    let sentCount = 0;

    for (const alert of alerts) {
      const position = await storage.getPosition(user.id, alert.positionId!);
      if (position && !alert.dismissed) {
        await telegramService.sendAlert(user.id, alert, position);
        sentCount++;
      }
    }

    res.json({
      success: true,
      message: `Sent ${sentCount} alert(s) via Telegram`,
      count: sentCount
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to send alerts',
      error: error.response?.data?.description || error.message
    });
  }
});

// Feedback/Contact form submission (public - no auth required)
router.post("/api/feedback", optionalAuth, async (req: any, res) => {
  try {
    // Get user ID if logged in
    let userId: string | null = null;
    const sessionUser = await getSessionUser(req);
    if (sessionUser) {
      userId = sessionUser.id;
    }

    // Validate using schema
    const parsed = insertFeedbackSchema.safeParse({
      ...req.body,
      userId,
    });

    if (!parsed.success) {
      const errors = parsed.error.errors.map(e => e.message).join(', ');
      return res.status(400).json({ message: errors || "Invalid input" });
    }

    // Additional validation for feedback types
    const validTypes = ['feedback', 'suggestion', 'bug', 'question', 'other'];
    if (!validTypes.includes(parsed.data.type)) {
      return res.status(400).json({ message: "Invalid feedback type" });
    }

    const feedbackEntry = await storage.createFeedback(parsed.data);

    res.status(201).json({
      success: true,
      message: "Thank you for your feedback! We'll get back to you soon.",
      id: feedbackEntry.id
    });
  } catch (error: any) {
    console.error("Error saving feedback:", error);
    res.status(500).json({ message: "Failed to submit feedback. Please try again." });
  }
});

// Stats endpoint (protected)
router.get("/api/stats", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const openPositions = await storage.getPositions(user.id, 'open');
    const scanResults = await storage.getLatestScanResults(user.id);
    const alerts = await storage.getActiveAlerts(user.id);

    const qualified = scanResults.filter(r => r.status === 'qualified');

    // Calculate unrealized P/L
    let totalPL = 0;
    for (const pos of openPositions) {
      // This is simplified - in real app would fetch current mid price
      const entryCreditCents = pos.entryCreditCents || 0;
      const currentValue = entryCreditCents * 0.7; // Assume 30% profit on average
      totalPL += (entryCreditCents - currentValue);
    }

    const stats = {
      activePositions: openPositions.length,
      candidates: qualified.length,
      unrealizedPL: totalPL, // Already in cents for full contract (100 shares)
      pendingAlerts: alerts.length,
    };

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
