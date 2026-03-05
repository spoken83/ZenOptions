import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, requireUser } from "../auth0";
import { monitorService } from "../services/monitor";
import { telegramService } from "../services/telegram";

const router = Router();

// Monitor routes
router.post("/api/monitor/run", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    await monitorService.checkPositions(user.id);
    res.json({ success: true, message: "Monitoring completed" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Alert routes (protected)
router.get("/api/alerts", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const alerts = await storage.getActiveAlerts(user.id);
    res.json(alerts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/api/alerts/:id/dismiss", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    await storage.dismissAlert(user.id, req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/api/alerts/dismiss-all", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    await storage.dismissAllAlerts(user.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Mirror GET for dev environments that mangle POST (protected)
router.get("/api/alerts/dismiss-all", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    await storage.dismissAllAlerts(user.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Seed sample scanner alerts (no positionId) (protected)
router.post("/api/alerts/sample-scan", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const types = ["scan:preopen", "scan:open", "scan:close"] as const;
    const created = [] as any[];
    for (const t of types) {
      const a = await storage.createAlert(user.id, { positionId: null as any, type: t as any, currentMidCents: null });
      created.push(a);
    }
    res.json({ success: true, created: created.length });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Mirror GET for sample scan alerts (protected)
router.get("/api/alerts/sample-scan", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const types = ["scan:preopen", "scan:open", "scan:close"] as const;
    const created = [] as any[];
    for (const t of types) {
      const a = await storage.createAlert(user.id, { positionId: null as any, type: t as any, currentMidCents: null });
      created.push(a);
    }
    res.json({ success: true, created: created.length });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Create sample alerts for testing (protected)
router.post("/api/alerts/sample", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    // Create sample positions first
    const samplePositions = [
      {
        symbol: 'AAPL',
        type: 'PUT',
        shortStrike: 150,
        longStrike: 145,
        entryCreditCents: 250, // $2.50
        expiry: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000), // 25 days from now
        status: 'open',
      },
      {
        symbol: 'TSLA',
        type: 'CALL',
        shortStrike: 200,
        longStrike: 205,
        entryCreditCents: 180, // $1.80
        expiry: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days from now
        status: 'open',
      },
      {
        symbol: 'SPY',
        type: 'PUT',
        shortStrike: 420,
        longStrike: 415,
        entryCreditCents: 320, // $3.20
        expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        status: 'open',
      }
    ];

    const createdPositions = [];
    for (const positionData of samplePositions) {
      try {
        const position = await storage.createPosition(user.id, positionData);
        createdPositions.push(position);
      } catch (error) {
        // Position might already exist, try to find it
        const existingPositions = await storage.getPositions(user.id, 'open');
        const existing = existingPositions.find(p =>
          p.symbol === positionData.symbol &&
          p.type === positionData.type &&
          p.shortStrike === positionData.shortStrike &&
          p.longStrike === positionData.longStrike
        );
        if (existing) {
          createdPositions.push(existing);
        }
      }
    }

    // Create sample alerts for each position
    const alertTypes = [
      { type: 'tp25', currentMidCents: 188, description: 'Take Profit 25%' },
      { type: 'tp50', currentMidCents: 125, description: 'Take Profit 50%' },
      { type: 'dte28', currentMidCents: null, description: '28 DTE' },
      { type: 'dte25', currentMidCents: null, description: '25 DTE' },
      { type: 'dte21', currentMidCents: null, description: '21 DTE' },
      { type: 'sl1x', currentMidCents: 250, description: 'Stop Loss 1x' },
      { type: 'sl1_5x', currentMidCents: 270, description: 'Stop Loss 1.5x' },
      { type: 'stop2x', currentMidCents: 500, description: 'Stop Loss 2x' }
    ];

    const createdAlerts = [];
    for (const position of createdPositions) {
      for (const alertType of alertTypes) {
        try {
          const alert = {
            positionId: position.id,
            type: alertType.type,
            currentMidCents: alertType.currentMidCents,
          };

          const newAlert = await storage.createAlert(user.id, alert);
          createdAlerts.push(newAlert);
        } catch (error) {
          // Alert might already exist, skip
        }
      }
    }

    res.json({
      success: true,
      message: `Created ${createdPositions.length} positions and ${createdAlerts.length} alerts`,
      positions: createdPositions.length,
      alerts: createdAlerts.length
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Mirror as GET to avoid any POST middleware/proxy quirks in dev (protected)
router.get("/api/alerts/sample", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const samplePositions = [
      {
        symbol: 'AAPL',
        type: 'PUT',
        shortStrike: 150,
        longStrike: 145,
        entryCreditCents: 250,
        expiry: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        status: 'open',
      },
      {
        symbol: 'TSLA',
        type: 'CALL',
        shortStrike: 200,
        longStrike: 205,
        entryCreditCents: 180,
        expiry: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        status: 'open',
      },
      {
        symbol: 'SPY',
        type: 'PUT',
        shortStrike: 420,
        longStrike: 415,
        entryCreditCents: 320,
        expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'open',
      }
    ];

    const createdPositions: any[] = [];
    for (const positionData of samplePositions) {
      try {
        const position = await storage.createPosition(user.id, positionData as any);
        createdPositions.push(position);
      } catch {
        const existingPositions = await storage.getPositions(user.id, 'open');
        const existing = existingPositions.find(p =>
          p.symbol === positionData.symbol &&
          p.type === positionData.type &&
          p.shortStrike === positionData.shortStrike &&
          p.longStrike === positionData.longStrike
        );
        if (existing) createdPositions.push(existing);
      }
    }

    const alertTypes = [
      { type: 'tp25', currentMidCents: 188 },
      { type: 'tp50', currentMidCents: 125 },
      { type: 'dte28', currentMidCents: null },
      { type: 'dte25', currentMidCents: null },
      { type: 'dte21', currentMidCents: null },
      { type: 'sl1x', currentMidCents: 250 },
      { type: 'sl1_5x', currentMidCents: 270 },
      { type: 'stop2x', currentMidCents: 500 }
    ];

    const createdAlerts: any[] = [];
    for (const position of createdPositions) {
      for (const alertType of alertTypes) {
        try {
          const newAlert = await storage.createAlert(user.id, {
            positionId: position.id,
            type: alertType.type as any,
            currentMidCents: alertType.currentMidCents as any,
          });
          createdAlerts.push(newAlert);
        } catch {}
      }
    }

    res.json({
      success: true,
      message: `Created ${createdPositions.length} positions and ${createdAlerts.length} alerts`,
      positions: createdPositions.length,
      alerts: createdAlerts.length,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
