const ROLES = ['mod', 'admin'];

// Usage: requireRole('admin') or requireRole('mod')
export function requireRole(minimumRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userRoleIndex = ROLES.indexOf(req.user.role);
    const requiredIndex = ROLES.indexOf(minimumRole);

    if (userRoleIndex === -1 || userRoleIndex < requiredIndex) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}