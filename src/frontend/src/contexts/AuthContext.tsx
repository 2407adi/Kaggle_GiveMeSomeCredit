import React, { createContext, useContext, useState, useEffect } from "react";

interface AuthContextType {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user was previously logged in
    const authStatus = localStorage.getItem("auth-status");
    if (authStatus === "authenticated") {
      setIsAuthenticated(true);
    }
  }, []);

  const validateCredentials = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch("/auth-credentials.json");
      const data = await response.json();
      
      return data.credentials.some((cred: any) => 
        cred.username === username && cred.password === password
      );
    } catch (error) {
      console.error("Error validating credentials:", error);
      return false;
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    const isValid = await validateCredentials(username, password);
    if (isValid) {
      setIsAuthenticated(true);
      localStorage.setItem("auth-status", "authenticated");
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem("auth-status");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}