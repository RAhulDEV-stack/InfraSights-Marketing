-- ============================================================================
-- Infrasights v2.10 - Enterprise Database Schema (Transact-SQL / MSSQL)
-- Idempotent Migration Script
-- ============================================================================

-- 1. Users Table
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        email NVARCHAR(255) NOT NULL,
        password_hash NVARCHAR(255) NOT NULL,
        full_name NVARCHAR(150) NOT NULL,
        organization NVARCHAR(150) NOT NULL,
        department_role NVARCHAR(100) NULL,
        is_active BIT NOT NULL DEFAULT 1,
        is_verified BIT NOT NULL DEFAULT 1,
        created_at DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
        updated_at DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT UQ_Users_Email UNIQUE (email)
    );

    CREATE NONCLUSTERED INDEX IX_Users_Email ON dbo.Users(email);
END;

-- 2. User Sessions / Refresh Tokens Table
IF OBJECT_ID(N'dbo.UserSessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserSessions (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        user_id UNIQUEIDENTIFIER NOT NULL,
        token_hash NVARCHAR(255) NOT NULL,
        ip_address NVARCHAR(45) NULL,
        user_agent NVARCHAR(500) NULL,
        expires_at DATETIME2(7) NOT NULL,
        created_at DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
        revoked_at DATETIME2(7) NULL,
        CONSTRAINT FK_UserSessions_Users FOREIGN KEY (user_id) 
            REFERENCES dbo.Users(id) ON DELETE CASCADE
    );

    CREATE NONCLUSTERED INDEX IX_UserSessions_UserId ON dbo.UserSessions(user_id);
    CREATE NONCLUSTERED INDEX IX_UserSessions_TokenHash ON dbo.UserSessions(token_hash);
END;

-- 3. Deployment Qualification Requests Table
IF OBJECT_ID(N'dbo.DeploymentRequests', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DeploymentRequests (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        tracking_ref NVARCHAR(32) NOT NULL,
        user_id UNIQUEIDENTIFIER NOT NULL,
        organization_name NVARCHAR(200) NOT NULL,
        business_email NVARCHAR(255) NOT NULL,
        country_region NVARCHAR(100) NOT NULL,
        department_role NVARCHAR(100) NOT NULL,
        san_vendor NVARCHAR(100) NULL,
        switch_count_range NVARCHAR(50) NOT NULL,
        fabric_count NVARCHAR(50) NOT NULL,
        deployment_model NVARCHAR(100) NOT NULL,
        target_timeline NVARCHAR(50) NOT NULL,
        objectives_notes NVARCHAR(MAX) NULL,
        qualification_payload_json NVARCHAR(MAX) NULL,
        status NVARCHAR(50) NOT NULL DEFAULT 'PENDING_REVIEW',
        assigned_engineer NVARCHAR(150) NULL,
        created_at DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
        updated_at DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT UQ_DeploymentRequests_TrackingRef UNIQUE (tracking_ref),
        CONSTRAINT FK_DeploymentRequests_Users FOREIGN KEY (user_id) 
            REFERENCES dbo.Users(id) ON DELETE NO ACTION
    );

    CREATE NONCLUSTERED INDEX IX_DeploymentRequests_TrackingRef ON dbo.DeploymentRequests(tracking_ref);
    CREATE NONCLUSTERED INDEX IX_DeploymentRequests_UserId ON dbo.DeploymentRequests(user_id);
    CREATE NONCLUSTERED INDEX IX_DeploymentRequests_Status ON dbo.DeploymentRequests(status);
END;

-- 4. Audit Log Table
IF OBJECT_ID(N'dbo.AuditLogs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditLogs (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        user_id UNIQUEIDENTIFIER NULL,
        event_type NVARCHAR(50) NOT NULL,
        event_description NVARCHAR(500) NOT NULL,
        ip_address NVARCHAR(45) NULL,
        created_at DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT FK_AuditLogs_Users FOREIGN KEY (user_id) 
            REFERENCES dbo.Users(id) ON DELETE SET NULL
    );

    CREATE NONCLUSTERED INDEX IX_AuditLogs_EventType ON dbo.AuditLogs(event_type);
END;
