import { createContext, useContext } from 'react';
export type Status = 'ONLINE' | 'SIBUK' | 'OFFLINE';
export const Context = createContext({ checked: false, status: 'OFFLINE' as Status, select: (_value: Status) => {}, reset: () => {} });
export const useLocalCheckIn = () => useContext(Context);
