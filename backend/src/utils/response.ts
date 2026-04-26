import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export const successResponse = <T>(res: Response, data: T, statusCode = 200): Response => {
  return res.status(statusCode).json({
    success: true,
    data,
  });
};

export const errorResponse = (res: Response, error: string, statusCode = 400): Response => {
  return res.status(statusCode).json({
    success: false,
    error,
  });
};

export const createdResponse = <T>(res: Response, data: T): Response => {
  return res.status(201).json({
    success: true,
    data,
  });
};

export const paginatedResponse = <T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  limit: number
): Response => {
  return res.status(200).json({
    success: true,
    data: {
      items,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    },
  });
};
