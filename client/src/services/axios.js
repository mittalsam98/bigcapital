import axios from 'axios';
import store from 'store/createStore';

const http = axios.create();

http.interceptors.request.use((request) => {
  const state = store.getState();
  const { token, organization } = state.authentication;
  const locale = 'en';

  if (token) {
    request.headers.common['x-access-token'] = token;
  }
  if (organization) {
    request.headers.common['organization-id'] = organization;
  }
  if (locale) {
    request.headers.common['Accept-Language'] = locale;
  }
  return request;
}, (error) => {
  return Promise.reject(error);
});

http.interceptors.response.use((response) => response, (error) => {
  const { status } = error.response;

  if (status >= 500) {
    
  }
  if (status === 401) {

  }
  return Promise.reject(error);
});

export default http;