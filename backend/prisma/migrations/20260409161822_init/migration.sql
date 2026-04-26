-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "pushToken" TEXT,
    "pushTokenUpdatedAt" TIMESTAMP(3),
    "stripeConnectAccountId" TEXT,
    "stripeAccountStatus" TEXT,
    "kycStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "kycDocumentsLegacy" TEXT,
    "faceEmbedding" TEXT,
    "faceVerificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "faceVerifiedAt" TIMESTAMP(3),
    "faceConfidenceScore" DOUBLE PRECISION,
    "idDocumentNumber" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "walletBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeals" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OTP" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OTP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "travelerId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fromCity" TEXT NOT NULL,
    "toCity" TEXT NOT NULL,
    "fromCountry" TEXT NOT NULL,
    "toCountry" TEXT NOT NULL,
    "fromLat" DOUBLE PRECISION,
    "fromLng" DOUBLE PRECISION,
    "toLat" DOUBLE PRECISION,
    "toLng" DOUBLE PRECISION,
    "packageSize" TEXT NOT NULL,
    "weight" DOUBLE PRECISION,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "pickupDate" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "images" TEXT,
    "qrCode" TEXT,
    "qrSecret" TEXT,
    "receiverCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dealId" TEXT,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stripeId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatParticipant" (
    "id" TEXT NOT NULL,
    "chatRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "chatRoomId" TEXT NOT NULL,
    "senderId" TEXT,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "travelerId" TEXT NOT NULL,
    "fromCity" TEXT NOT NULL,
    "toCity" TEXT NOT NULL,
    "fromCountry" TEXT NOT NULL,
    "toCountry" TEXT NOT NULL,
    "departureDate" TIMESTAMP(3),
    "departureTime" TEXT,
    "flightNumber" TEXT,
    "maxWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "negotiable" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "filerId" TEXT NOT NULL,
    "againstId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "evidence" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPENED',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "slaDeadline" TIMESTAMP(3) NOT NULL DEFAULT NOW() + interval '72 hours',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeEvidence" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "authorId" TEXT,
    "targetId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "sentiment" TEXT,
    "fraudScore" DOUBLE PRECISION,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappLog" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingDataPoint" (
    "id" TEXT NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingDataPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deals" BOOLEAN NOT NULL DEFAULT true,
    "messages" BOOLEAN NOT NULL DEFAULT true,
    "payments" BOOLEAN NOT NULL DEFAULT true,
    "promotions" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pendingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "availableBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsDeclaration" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "declarationType" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "declaredValue" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exportCountry" TEXT NOT NULL,
    "importCountry" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomsDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaceScan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scanType" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "livenessScore" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaceScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "scoreType" TEXT NOT NULL DEFAULT 'STANDARD',
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "completionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLinks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrustScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminTask" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedTo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "frontUrl" TEXT NOT NULL,
    "backUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entityId" TEXT,
    "entityType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "metadata" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_kycStatus_idx" ON "User"("kycStatus");

-- CreateIndex
CREATE INDEX "User_faceVerificationStatus_idx" ON "User"("faceVerificationStatus");

-- CreateIndex
CREATE INDEX "User_isAdmin_idx" ON "User"("isAdmin");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshToken_key" ON "Session"("refreshToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_refreshToken_idx" ON "Session"("refreshToken");

-- CreateIndex
CREATE INDEX "OTP_phone_verified_idx" ON "OTP"("phone", "verified");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "Deal_fromCity_toCity_idx" ON "Deal"("fromCity", "toCity");

-- CreateIndex
CREATE INDEX "Deal_senderId_idx" ON "Deal"("senderId");

-- CreateIndex
CREATE INDEX "Deal_travelerId_idx" ON "Deal"("travelerId");

-- CreateIndex
CREATE INDEX "Deal_createdAt_idx" ON "Deal"("createdAt");

-- CreateIndex
CREATE INDEX "Deal_price_idx" ON "Deal"("price");

-- CreateIndex
CREATE INDEX "TrackingEvent_dealId_createdAt_idx" ON "TrackingEvent"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_stripeId_idx" ON "Transaction"("stripeId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRoom_dealId_key" ON "ChatRoom"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatParticipant_chatRoomId_userId_key" ON "ChatParticipant"("chatRoomId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessage_chatRoomId_createdAt_idx" ON "ChatMessage"("chatRoomId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Trip_travelerId_idx" ON "Trip"("travelerId");

-- CreateIndex
CREATE INDEX "Trip_fromCity_toCity_idx" ON "Trip"("fromCity", "toCity");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "Trip_departureDate_idx" ON "Trip"("departureDate");

-- CreateIndex
CREATE INDEX "Dispute_dealId_idx" ON "Dispute"("dealId");

-- CreateIndex
CREATE INDEX "Dispute_filerId_idx" ON "Dispute"("filerId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "Dispute_slaDeadline_idx" ON "Dispute"("slaDeadline");

-- CreateIndex
CREATE INDEX "DisputeEvidence_disputeId_idx" ON "DisputeEvidence"("disputeId");

-- CreateIndex
CREATE INDEX "Review_dealId_authorId_idx" ON "Review"("dealId", "authorId");

-- CreateIndex
CREATE INDEX "Review_targetId_idx" ON "Review"("targetId");

-- CreateIndex
CREATE INDEX "Review_authorId_idx" ON "Review"("authorId");

-- CreateIndex
CREATE INDEX "Review_flagged_idx" ON "Review"("flagged");

-- CreateIndex
CREATE INDEX "Review_status_idx" ON "Review"("status");

-- CreateIndex
CREATE INDEX "WhatsappLog_status_createdAt_idx" ON "WhatsappLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PricingDataPoint_createdAt_idx" ON "PricingDataPoint"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSettings_userId_key" ON "NotificationSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "CustomsDeclaration_dealId_idx" ON "CustomsDeclaration"("dealId");

-- CreateIndex
CREATE INDEX "FaceScan_userId_idx" ON "FaceScan"("userId");

-- CreateIndex
CREATE INDEX "FaceScan_scanType_idx" ON "FaceScan"("scanType");

-- CreateIndex
CREATE INDEX "FaceScan_verified_idx" ON "FaceScan"("verified");

-- CreateIndex
CREATE INDEX "FaceScan_userId_scanType_idx" ON "FaceScan"("userId", "scanType");

-- CreateIndex
CREATE INDEX "FaceScan_createdAt_idx" ON "FaceScan"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrustScore_userId_key" ON "TrustScore"("userId");

-- CreateIndex
CREATE INDEX "AdminTask_status_type_idx" ON "AdminTask"("status", "type");

-- CreateIndex
CREATE INDEX "AdminTask_assignedTo_idx" ON "AdminTask"("assignedTo");

-- CreateIndex
CREATE INDEX "AdminTask_createdAt_idx" ON "AdminTask"("createdAt");

-- CreateIndex
CREATE INDEX "KycDocument_userId_idx" ON "KycDocument"("userId");

-- CreateIndex
CREATE INDEX "KycDocument_status_idx" ON "KycDocument"("status");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_recordedAt_idx" ON "AuditLog"("recordedAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatParticipant" ADD CONSTRAINT "ChatParticipant_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatParticipant" ADD CONSTRAINT "ChatParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_filerId_fkey" FOREIGN KEY ("filerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_againstId_fkey" FOREIGN KEY ("againstId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeEvidence" ADD CONSTRAINT "DisputeEvidence_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsDeclaration" ADD CONSTRAINT "CustomsDeclaration_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceScan" ADD CONSTRAINT "FaceScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustScore" ADD CONSTRAINT "TrustScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
