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

  // Demo gate only - this is client-side and provides no real security.
  // Anything shipped to the browser (including these values) is public;
  // protect real deployments with backend authentication.
  const validateCredentials = async (username: string, password: string): Promise<boolean> => {
    const demoUsername = import.meta.env.VITE_DEMO_USERNAME || "nu10admin";
    const demoPassword = import.meta.env.VITE_DEMO_PASSWORD || "admin123";
    return username === demoUsername && password === demoPassword;
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