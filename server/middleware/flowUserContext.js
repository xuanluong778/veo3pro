export function attachFlowUserContext(req, _res, next) {
  req.flowUserKey =
    (typeof req.headers['x-flow-user-id'] === 'string' && req.headers['x-flow-user-id'].slice(0, 128)) ||
    req.ip ||
    'anonymous';
  next();
}
