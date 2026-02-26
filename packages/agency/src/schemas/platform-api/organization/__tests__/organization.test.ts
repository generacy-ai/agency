import { describe, it, expect } from 'vitest';
import {
  OrganizationSchema,
  Organization,
  OrganizationSlugSchema,
  OrganizationSubscriptionTierSchema,
  OrganizationIdSchema,
  generateOrganizationId,
  parseOrganization,
  safeParseOrganization,
} from '../organization.js';
import {
  MembershipSchema,
  Membership,
  MemberRoleSchema,
  MembershipIdSchema,
  generateMembershipId,
  parseMembership,
  safeParseMembership,
} from '../membership.js';
import {
  InviteSchema,
  Invite,
  InviteStatusSchema,
  InviteIdSchema,
  generateInviteId,
  parseInvite,
  safeParseInvite,
} from '../invite.js';

const validUlid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const ts = '2024-01-15T10:30:00Z';

// =============================================================================
// Organization
// =============================================================================

describe('OrganizationSlugSchema', () => {
  it('accepts valid slugs', () => {
    expect(OrganizationSlugSchema.safeParse('acme-corp').success).toBe(true);
    expect(OrganizationSlugSchema.safeParse('my-org').success).toBe(true);
    expect(OrganizationSlugSchema.safeParse('abc').success).toBe(true);
    expect(OrganizationSlugSchema.safeParse('test123').success).toBe(true);
  });

  it('rejects slugs shorter than 3 chars', () => {
    expect(OrganizationSlugSchema.safeParse('ab').success).toBe(false);
  });

  it('rejects slugs longer than 50 chars', () => {
    expect(OrganizationSlugSchema.safeParse('a'.repeat(51)).success).toBe(false);
  });

  it('rejects slugs with leading hyphen', () => {
    expect(OrganizationSlugSchema.safeParse('-acme').success).toBe(false);
  });

  it('rejects slugs with trailing hyphen', () => {
    expect(OrganizationSlugSchema.safeParse('acme-').success).toBe(false);
  });

  it('rejects slugs with consecutive hyphens', () => {
    expect(OrganizationSlugSchema.safeParse('acme--corp').success).toBe(false);
  });

  it('rejects uppercase slugs', () => {
    expect(OrganizationSlugSchema.safeParse('AcmeCorp').success).toBe(false);
  });
});

describe('OrganizationSubscriptionTierSchema', () => {
  it('accepts valid tiers', () => {
    for (const tier of ['starter', 'team', 'enterprise']) {
      expect(OrganizationSubscriptionTierSchema.safeParse(tier).success).toBe(true);
    }
  });

  it('rejects invalid tier', () => {
    expect(OrganizationSubscriptionTierSchema.safeParse('free').success).toBe(false);
  });
});

describe('OrganizationSchema', () => {
  const validOrg = {
    id: validUlid,
    name: 'Acme Corporation',
    slug: 'acme-corp',
    ownerId: validUlid,
    subscriptionTier: 'team',
    createdAt: ts,
    updatedAt: ts,
  };

  it('parses valid organization', () => {
    const result = OrganizationSchema.safeParse(validOrg);
    expect(result.success).toBe(true);
  });

  it('accepts optional fields', () => {
    const result = OrganizationSchema.safeParse({
      ...validOrg,
      description: 'A test org',
      avatarUrl: 'https://example.com/avatar.png',
      archivedAt: ts,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const { name, ...noName } = validOrg;
    expect(OrganizationSchema.safeParse(noName).success).toBe(false);
  });

  it('rejects invalid ownerId', () => {
    expect(OrganizationSchema.safeParse({ ...validOrg, ownerId: 'bad' }).success).toBe(false);
  });

  it('rejects invalid avatarUrl', () => {
    expect(OrganizationSchema.safeParse({ ...validOrg, avatarUrl: 'not-a-url' }).success).toBe(false);
  });
});

describe('Organization namespace', () => {
  it('has V1 and Latest', () => {
    expect(Organization.V1).toBeDefined();
    expect(Organization.Latest).toBe(Organization.V1);
  });

  it('getVersion returns V1', () => {
    expect(Organization.getVersion('v1')).toBe(Organization.V1);
  });
});

describe('Organization parse helpers', () => {
  const valid = {
    id: validUlid,
    name: 'Test',
    slug: 'test-org',
    ownerId: validUlid,
    subscriptionTier: 'starter',
    createdAt: ts,
    updatedAt: ts,
  };

  it('parseOrganization succeeds for valid data', () => {
    expect(() => parseOrganization(valid)).not.toThrow();
  });

  it('parseOrganization throws for invalid data', () => {
    expect(() => parseOrganization({})).toThrow();
  });

  it('safeParseOrganization returns success/error', () => {
    expect(safeParseOrganization(valid).success).toBe(true);
    expect(safeParseOrganization({}).success).toBe(false);
  });
});

describe('generateOrganizationId', () => {
  it('generates valid ULID', () => {
    const id = generateOrganizationId();
    expect(OrganizationIdSchema.safeParse(id).success).toBe(true);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateOrganizationId()));
    expect(ids.size).toBe(10);
  });
});

// =============================================================================
// Membership
// =============================================================================

describe('MemberRoleSchema', () => {
  it('accepts valid roles', () => {
    for (const role of ['owner', 'admin', 'member', 'viewer']) {
      expect(MemberRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  it('rejects invalid role', () => {
    expect(MemberRoleSchema.safeParse('superadmin').success).toBe(false);
  });
});

describe('MembershipSchema', () => {
  const validMembership = {
    id: validUlid,
    organizationId: validUlid,
    userId: validUlid,
    role: 'member',
    joinedAt: ts,
  };

  it('parses valid membership', () => {
    expect(MembershipSchema.safeParse(validMembership).success).toBe(true);
  });

  it('accepts optional fields', () => {
    const result = MembershipSchema.safeParse({
      ...validMembership,
      displayName: 'John Doe',
      updatedAt: ts,
      revokedAt: ts,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid userId', () => {
    expect(MembershipSchema.safeParse({ ...validMembership, userId: 'bad' }).success).toBe(false);
  });

  it('rejects missing role', () => {
    const { role, ...noRole } = validMembership;
    expect(MembershipSchema.safeParse(noRole).success).toBe(false);
  });
});

describe('Membership namespace', () => {
  it('has V1 and Latest', () => {
    expect(Membership.V1).toBeDefined();
    expect(Membership.Latest).toBe(Membership.V1);
  });
});

describe('generateMembershipId', () => {
  it('generates valid ULID', () => {
    const id = generateMembershipId();
    expect(MembershipIdSchema.safeParse(id).success).toBe(true);
  });
});

describe('Membership parse helpers', () => {
  const valid = {
    id: validUlid,
    organizationId: validUlid,
    userId: validUlid,
    role: 'admin',
    joinedAt: ts,
  };

  it('parseMembership succeeds', () => {
    expect(() => parseMembership(valid)).not.toThrow();
  });

  it('safeParseMembership returns result', () => {
    expect(safeParseMembership(valid).success).toBe(true);
    expect(safeParseMembership({}).success).toBe(false);
  });
});

// =============================================================================
// Invite
// =============================================================================

describe('InviteStatusSchema', () => {
  it('accepts valid statuses', () => {
    for (const s of ['pending', 'accepted', 'expired', 'revoked']) {
      expect(InviteStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    expect(InviteStatusSchema.safeParse('canceled').success).toBe(false);
  });
});

describe('InviteSchema', () => {
  const validInvite = {
    id: validUlid,
    organizationId: validUlid,
    email: 'user@example.com',
    role: 'member',
    status: 'pending',
    invitedById: validUlid,
    createdAt: ts,
    expiresAt: '2024-01-22T10:30:00Z',
  };

  it('parses valid invite', () => {
    expect(InviteSchema.safeParse(validInvite).success).toBe(true);
  });

  it('accepts optional fields', () => {
    const result = InviteSchema.safeParse({
      ...validInvite,
      message: 'Welcome to the team!',
      acceptedAt: ts,
      revokedAt: ts,
      acceptedById: validUlid,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(InviteSchema.safeParse({ ...validInvite, email: 'not-email' }).success).toBe(false);
  });

  it('rejects message over 500 chars', () => {
    expect(InviteSchema.safeParse({ ...validInvite, message: 'x'.repeat(501) }).success).toBe(false);
  });

  it('rejects invalid invitedById', () => {
    expect(InviteSchema.safeParse({ ...validInvite, invitedById: 'bad' }).success).toBe(false);
  });
});

describe('Invite namespace', () => {
  it('has V1 and Latest', () => {
    expect(Invite.V1).toBeDefined();
    expect(Invite.Latest).toBe(Invite.V1);
  });

  it('getVersion returns V1', () => {
    expect(Invite.getVersion('v1')).toBe(Invite.V1);
  });
});

describe('generateInviteId', () => {
  it('generates valid ULID', () => {
    const id = generateInviteId();
    expect(InviteIdSchema.safeParse(id).success).toBe(true);
  });
});

describe('Invite parse helpers', () => {
  const valid = {
    id: validUlid,
    organizationId: validUlid,
    email: 'test@test.com',
    role: 'viewer',
    status: 'pending',
    invitedById: validUlid,
    createdAt: ts,
    expiresAt: '2024-01-22T10:30:00Z',
  };

  it('parseInvite succeeds', () => {
    expect(() => parseInvite(valid)).not.toThrow();
  });

  it('safeParseInvite returns result', () => {
    expect(safeParseInvite(valid).success).toBe(true);
    expect(safeParseInvite({}).success).toBe(false);
  });
});
