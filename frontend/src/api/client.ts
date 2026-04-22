import axios from 'axios';
import { useAuthStore } from '../context/auth.store';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const { logout } = useAuthStore.getState();
      logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface LoginRequest { email: string; password: string }
export interface RegisterRequest { email: string; password: string; name: string }
export interface Space { id: string; name: string; key: string; description?: string; visibility: string; owner: { id: string; name: string } }
export interface Page { id: string; title: string; slug: string; content?: string; status: string; createdAt: string; updatedAt: string; creator?: { id: string; name: string } }

export const authApi = {
  login: (data: LoginRequest) => api.post<{ accessToken: string; refreshToken: string; user: any }>('/auth/login', data),
  register: (data: RegisterRequest) => api.post('/auth/register', data),
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
  me: () => api.get('/auth/me'),
};

export const spacesApi = {
  list: () => api.get<Space[]>('/spaces'),
  get: (key: string) => api.get<Space>(`/spaces/${key}`),
  create: (data: { name: string; key: string; description?: string; visibility?: string }) => api.post('/spaces', data),
  update: (key: string, data: Partial<Space>) => api.put(`/spaces/${key}`, data),
  delete: (key: string) => api.delete(`/spaces/${key}`),
  members: {
    list: (key: string) => api.get(`/spaces/${key}/members`),
    add: (key: string, data: { userId: string; role: string }) => api.post(`/spaces/${key}/members`, data),
    update: (key: string, userId: string, role: string) => api.put(`/spaces/${key}/members/${userId}`, { role }),
    remove: (key: string, userId: string) => api.delete(`/spaces/${key}/members/${userId}`),
  },
};

export const pagesApi = {
  list: (spaceKey: string) => api.get<Page[]>(`/spaces/${spaceKey}/pages`),
  get: (spaceKey: string, slug: string) => api.get<Page>(`/spaces/${spaceKey}/pages/${slug}`),
  create: (spaceKey: string, data: { title: string; slug: string; content?: string; parentId?: string }) => api.post(`/spaces/${spaceKey}/pages`, data),
  update: (spaceKey: string, slug: string, data: Partial<Page>) => api.put(`/spaces/${spaceKey}/pages/${slug}`, data),
  delete: (spaceKey: string, slug: string) => api.delete(`/spaces/${spaceKey}/pages/${slug}`),
  move: (spaceKey: string, slug: string, data: { parentId?: string; position?: number }) => api.put(`/spaces/${spaceKey}/pages/${slug}/move`, data),
  versions: (spaceKey: string, slug: string) => api.get(`/spaces/${spaceKey}/pages/${slug}/versions`),
};

export const searchApi = {
  search: (params: { q: string; space?: string; type?: string }) => api.get('/search', { params }),
};
