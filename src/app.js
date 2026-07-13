import React, { useState } from 'react';
import Login from './Login';
import Dashboard from './Dashboard';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  const handleLogin = (userInfo) => {
    setUser(userInfo); // 사용자 정보 저장
    setIsAuthenticated(true);
  };

  return (
    <>
      {!isAuthenticated ? (
        <Login onLogin={handleLogin} />
      ) : (
        // 여기서 user={user}를 Dashboard로 전달합니다.
        <Dashboard user={user} onLogout={() => setIsAuthenticated(false)} />
      )}
    </>
  );
}