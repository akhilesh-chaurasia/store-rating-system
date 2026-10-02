const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Reusable fetch wrapper configured with credentials: 'include'
 * to automatically send and receive HTTP-only authentication cookies
 */
export const apiFetch = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    ...options,
    credentials: 'include', // Sends HTTP-only JWT cookies across origins
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  const response = await fetch(url, config);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed with status: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

// Health check service
export const checkHealth = () => apiFetch('/health');

// Authentication API methods
export const registerUser = (userData) =>
  apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  });

export const loginUser = (credentials) =>
  apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

export const logoutUser = () =>
  apiFetch('/auth/logout', {
    method: 'POST',
  });

export const getCurrentUser = () => apiFetch('/auth/me');

export const changePassword = (passwordData) =>
  apiFetch('/auth/password', {
    method: 'PATCH',
    body: JSON.stringify(passwordData),
  });

export default API_BASE_URL;
