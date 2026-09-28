-- Plan: access levels — keep what existing employee grants already allowed.
--
-- Before powers were split, a `ViewPersonalDetails` grant also showed a
-- colleague's working hours (attendance), and `ManageEmployees` also included
-- personal details and working hours. Those are now separate switches, so
-- every holder of either gets both explicitly and nobody loses access.
--
-- Separate from `..._access_levels` because 'ViewAttendance' was added there,
-- and Postgres refuses to use a new enum value inside the transaction that
-- created it.
INSERT INTO "PermissionGrant" ("id", "companyId", "employeeId", "permission", "effect", "grantedById", "createdAt")
SELECT gen_random_uuid()::text, s."companyId", s."employeeId", s."permission", 'Grant', s."grantedById", s."createdAt"
FROM (
  SELECT DISTINCT ON (g."companyId", g."employeeId", p."permission")
         g."companyId", g."employeeId", p."permission", g."grantedById", g."createdAt"
  FROM "PermissionGrant" g
  CROSS JOIN (
    VALUES ('ViewPersonalDetails'::"GrantedPermission"), ('ViewAttendance'::"GrantedPermission")
  ) AS p("permission")
  WHERE g."employeeId" IS NOT NULL
    AND g."effect" = 'Grant'
    AND g."permission" IN ('ViewPersonalDetails', 'ManageEmployees')
  ORDER BY g."companyId", g."employeeId", p."permission", g."createdAt"
) s
ON CONFLICT DO NOTHING;
