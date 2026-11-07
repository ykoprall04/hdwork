import { API_URL } from '@/config/api';
import { createOrderApi } from './transport';
export const orderApi = createOrderApi(API_URL);
