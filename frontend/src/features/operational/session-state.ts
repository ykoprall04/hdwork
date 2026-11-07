import { createContext, useContext } from 'react';
export const SessionState = createContext({ status: 'loading', error: '', retry: () => {} });
export const useOperationalSession = () => useContext(SessionState);
