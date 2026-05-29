-- CreateEnum
CREATE TYPE "RoomMode" AS ENUM ('CLOSED', 'VERIFICATION', 'EVALUATION', 'OPEN', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DoorStatus" AS ENUM ('CLOSED', 'OPEN');

-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('CREATED', 'VERIFICATION', 'EVALUATION', 'PASSED', 'FAILED', 'UNCERTAIN', 'OVERRIDDEN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EvaluationResult" AS ENUM ('PASSED', 'FAILED', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('PI', 'TABLET', 'DISPLAY', 'OPERATOR');

-- CreateTable
CREATE TABLE "RoomState" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "mode" "RoomMode" NOT NULL DEFAULT 'CLOSED',
    "activeSessionId" TEXT,
    "doorStatus" "DoorStatus" NOT NULL DEFAULT 'CLOSED',
    "occupancyCount" INTEGER NOT NULL DEFAULT 0,
    "openUntil" TIMESTAMP(3),
    "evaluationDeadline" TIMESTAMP(3),
    "currentTaskId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "state" "SessionState" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedByDevice" TEXT NOT NULL,
    "activeTaskId" TEXT NOT NULL,
    "observationStartedAt" TIMESTAMP(3),
    "observationEndedAt" TIMESTAMP(3),
    "solveStartedAt" TIMESTAMP(3),
    "solveEndedAt" TIMESTAMP(3),
    "evaluationResult" "EvaluationResult",
    "overrideAction" TEXT,
    "overrideReason" TEXT,
    "finalOutcome" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "instructionInner" TEXT NOT NULL,
    "evaluationPrompt" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionEvaluation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "evaluationStatus" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "rawModelResponse" JSONB NOT NULL,
    "normalizedResult" "EvaluationResult" NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "lastHeartbeat" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceEvent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drink" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "basePriceOuter" DOUBLE PRECISION NOT NULL,
    "basePriceInner" DOUBLE PRECISION NOT NULL,
    "pricingRuleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorAction" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomState_activeSessionId_key" ON "RoomState"("activeSessionId");

-- AddForeignKey
ALTER TABLE "RoomState" ADD CONSTRAINT "RoomState_activeSessionId_fkey" FOREIGN KEY ("activeSessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomState" ADD CONSTRAINT "RoomState_currentTaskId_fkey" FOREIGN KEY ("currentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_activeTaskId_fkey" FOREIGN KEY ("activeTaskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionEvaluation" ADD CONSTRAINT "SubmissionEvaluation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceEvent" ADD CONSTRAINT "DeviceEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drink" ADD CONSTRAINT "Drink_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "PricingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
