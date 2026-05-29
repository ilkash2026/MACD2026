import "dotenv/config";
import { PrismaClient, RoomMode, DoorStatus, DeviceType } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const defaultRule = await prisma.pricingRule.upsert({
    where: { id: "default-rule" },
    update: {
      name: "Occupancy Tier Rule",
      config: {
        ranges: [
          { max: 10, multiplier: 0.8 },
          { min: 11, max: 20, multiplier: 1.0 },
          { min: 21, multiplier: 1.3 }
        ]
      },
      active: true
    },
    create: {
      id: "default-rule",
      name: "Occupancy Tier Rule",
      config: {
        ranges: [
          { max: 10, multiplier: 0.8 },
          { min: 11, max: 20, multiplier: 1.0 },
          { min: 21, multiplier: 1.3 }
        ]
      },
      active: true
    }
  });

  await prisma.task.createMany({
    data: [
      {
        name: "Synchronized Toast",
        category: "gesture",
        instructionInner: "Everyone inside briefly raises a glass with the right hand and nods once.",
        evaluationPrompt:
          "Assess if the person in the submission image appears to imitate a social toast gesture: raised hand/imaginary glass and slight nod posture. Return PASSED only if gesture is reasonably clear.",
        difficulty: 1,
        version: 1,
        active: true
      },
      {
        name: "Three Finger Signal",
        category: "hand-signal",
        instructionInner: "Show three fingers near chest height while standing still.",
        evaluationPrompt:
          "Check if the person clearly shows a three-finger hand signal near chest height. If uncertain due to image quality, return UNCERTAIN.",
        difficulty: 1,
        version: 1,
        active: true
      }
    ],
    skipDuplicates: true
  });

  await prisma.drink.createMany({
    data: [
      {
        name: "House Soda",
        active: true,
        basePriceOuter: 6,
        basePriceInner: 4,
        pricingRuleId: defaultRule.id
      },
      {
        name: "Bitter Aperitif",
        active: true,
        basePriceOuter: 9,
        basePriceInner: 7,
        pricingRuleId: defaultRule.id
      }
    ],
    skipDuplicates: true
  });

  await prisma.device.upsert({
    where: { id: "buzzer-1" },
    update: {},
    create: {
      id: "buzzer-1",
      type: DeviceType.PI,
      role: "buzzer-pi",
      status: "ONLINE"
    }
  });

  await prisma.roomState.upsert({
    where: { id: "global" },
    update: {
      mode: RoomMode.CLOSED,
      doorStatus: DoorStatus.CLOSED,
      occupancyCount: 0
    },
    create: {
      id: "global",
      mode: RoomMode.CLOSED,
      doorStatus: DoorStatus.CLOSED,
      occupancyCount: 0
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
