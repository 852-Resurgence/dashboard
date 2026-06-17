import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  withCredentials: true,
})

client.interceptors.response.use(
  res => res,
  err => Promise.reject(err)
)

export default client