import React, { createContext, useContext, useState } from 'react';

export type SyncStatus = 'Online' | 'Low' | 'Offline';

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  station_name: string;
}


interface AppContextType {
  syncStatus: SyncStatus;
  setSyncStatus: (status: SyncStatus) => void;
  toggleSyncStatus: () => void;
  user: User | null;
  setUser: (user: User | null) => void;
  token: string | null;
  setToken: (token: string | null) => void;
  logout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('Online');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const toggleSyncStatus = () => {
    if (syncStatus === 'Online') setSyncStatus('Low');
    else if (syncStatus === 'Low') setSyncStatus('Offline');
    else setSyncStatus('Online');
  };

  const logout = () => {
    setUser(null);
    setToken(null);
  };

  return (
    <AppContext.Provider
      value={{
        syncStatus,
        setSyncStatus,
        toggleSyncStatus,
        user,
        setUser,
        token,
        setToken,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
