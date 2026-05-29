import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../db";
import { config } from "../config";
import { fail, ok } from "../http";
import { occupancyAdjustSchema, overrideSchema } from "../validation";
import { roomService } from "../services/room-service";

function operatorAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.header("x-operator-key");
  if (key !== config.operatorApiKey) {
    fail(res, "UNAUTHORIZED", "Operator key invalid", 401);
    return;
  }
  next();
}

export function createOperatorRouter(): Router {
  const router = Router();
  router.use(operatorAuth);

  router.post("/override", async (req, res) => {
    const parsed = overrideSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, "INVALID_BODY", parsed.error.message, 400);

    try {
      await roomService.operatorOverride(parsed.data);
      return ok(res, { accepted: true });
    } catch (error) {
      return fail(res, "OVERRIDE_FAILED", (error as Error).message, 409);
    }
  });

  router.post("/occupancy/adjust", async (req, res) => {
    const parsed = occupancyAdjustSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, "INVALID_BODY", parsed.error.message, 400);

    await roomService.operatorAdjustOccupancy(parsed.data.delta, parsed.data.reason);
    return ok(res, { accepted: true });
  });

  router.get("/tasks", async (_req, res) => ok(res, await prisma.task.findMany({ orderBy: { updatedAt: "desc" } })));
  router.post("/tasks", async (req, res) => ok(res, await prisma.task.create({ data: req.body })));
  router.patch("/tasks/:id", async (req, res) => ok(res, await prisma.task.update({ where: { id: req.params.id }, data: req.body })));
  router.delete("/tasks/:id", async (req, res) => {
    await prisma.task.update({ where: { id: req.params.id }, data: { active: false } });
    return ok(res, { deleted: true });
  });

  router.get("/drinks", async (_req, res) => ok(res, await prisma.drink.findMany({ include: { pricingRule: true }, orderBy: { name: "asc" } })));
  router.post("/drinks", async (req, res) => {
    const body = req.body as {
      name?: string;
      active?: boolean;
      basePriceOuter?: number;
      pricingRuleId?: string | null;
    };

    if (!body.name || typeof body.basePriceOuter !== "number") {
      return fail(res, "INVALID_BODY", "name and basePriceOuter are required", 400);
    }

    const created = await prisma.drink.create({
      data: {
        name: body.name,
        active: body.active ?? true,
        basePriceOuter: body.basePriceOuter,
        // Keep schema compatibility while ensuring inner is always rule-derived.
        basePriceInner: body.basePriceOuter,
        pricingRuleId: body.pricingRuleId ?? null
      }
    });

    return ok(res, created);
  });

  router.patch("/drinks/:id", async (req, res) => {
    const body = req.body as {
      name?: string;
      active?: boolean;
      basePriceOuter?: number;
      pricingRuleId?: string | null;
    };

    const data: {
      name?: string;
      active?: boolean;
      basePriceOuter?: number;
      basePriceInner?: number;
      pricingRuleId?: string | null;
    } = {};

    if (typeof body.name === "string") data.name = body.name;
    if (typeof body.active === "boolean") data.active = body.active;
    if (typeof body.basePriceOuter === "number") {
      data.basePriceOuter = body.basePriceOuter;
      // Keep schema compatibility while ensuring inner is always rule-derived.
      data.basePriceInner = body.basePriceOuter;
    }
    if (body.pricingRuleId !== undefined) data.pricingRuleId = body.pricingRuleId;

    return ok(res, await prisma.drink.update({ where: { id: req.params.id }, data }));
  });
  router.delete("/drinks/:id", async (req, res) => {
    await prisma.drink.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  });

  router.get("/pricing-rules", async (_req, res) => ok(res, await prisma.pricingRule.findMany({ orderBy: { updatedAt: "desc" } })));
  router.post("/pricing-rules", async (req, res) => ok(res, await prisma.pricingRule.create({ data: req.body })));
  router.patch("/pricing-rules/:id", async (req, res) => ok(res, await prisma.pricingRule.update({ where: { id: req.params.id }, data: req.body })));

  router.get("/devices", async (_req, res) => ok(res, await prisma.device.findMany({ orderBy: { updatedAt: "desc" } })));
  router.get("/sessions", async (_req, res) => ok(res, await prisma.session.findMany({ include: { task: true, evaluations: true }, orderBy: { createdAt: "desc" }, take: 100 })));
  router.get("/audit-logs", async (_req, res) => ok(res, await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 300 })));

  return router;
}
