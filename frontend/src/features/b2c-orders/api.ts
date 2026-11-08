import { API_URL } from '@/config/api';
import { createOrderApi } from './transport';
import {cookieMode,cookieFetch} from '../operational/cookie-http';
export const orderApi = createOrderApi(API_URL,cookieMode?cookieFetch:fetch);
