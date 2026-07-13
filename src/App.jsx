import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Dashboard from './Dashboard';
import Login from './Login'; // 대소문자 확인

export default function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    // 유저 정보 불러오는 함수
    const fetchProfile = async (user) => {
      if (!user) return;
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('email', user.email)
        .single();
      
      if (data) setUserProfile(data);
    };

    // 1. 첫 로딩 시 현재 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user);
    });

    // 2. 로그인/로그아웃 상태 변경 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user);
      } else {
        setUserProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div>
      {!session ? (
        <Login /> 
      ) : (
        <Dashboard user={session.user} userProfile={userProfile} onLogout={handleLogout} />
      )}
    </div>
  );
}