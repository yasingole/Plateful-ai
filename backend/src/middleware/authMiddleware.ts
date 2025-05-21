import { Request, Response, NextFunction } from 'express';
import jwt from 'express-jwt';
import jwksRsa from 'jwks-rsa';

// Define a custom interface extending the default Request
interface AuthRequest extends Request {
  auth?: {
    sub: string;
    [key: string]: any;
  };
}

// Auth0 configuration
const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
  }),
  audience: process.env.AUTH0_AUDIENCE,
  issuer: `https://${process.env.AUTH0_DOMAIN}/`,
  algorithms: ['RS256']
});

// This middleware will run after the JWT check
const handleAuthError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ message: 'Invalid token or missing authentication' });
  }
  next(err);
};

// Extract user info from the token
const extractUser = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.auth) {
    // We might want to fetch additional user info from our database here
    // For now, we'll just use the sub claim as the user ID
    req.user = {
      id: req.auth.sub,
      email: req.auth.email,
    };
  }
  next();
};

export const authenticate = [checkJwt, handleAuthError, extractUser];

export const requireAuth = [
  ...authenticate,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    next();
  }
];
