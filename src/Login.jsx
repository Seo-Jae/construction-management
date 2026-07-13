import React, { useState } from 'react';
import { Box, Button, TextField, Typography, Paper } from '@mui/material';
import { supabase } from './supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Supabase 이메일/비밀번호 로그인 요청
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      alert('로그인 실패: 이메일이나 비밀번호를 확인해주세요.');
      console.error(error);
    }
    setLoading(false);
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#f1f5f9' }}>
      <Paper sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 3, width: '100%', maxWidth: '360px', borderRadius: '12px', boxShadow: 3 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h5" fontWeight="bold" color="#1e293b" gutterBottom>
            🏗️ 스마트 공사 관리
          </Typography>
          <Typography variant="body2" color="text.secondary">
            관리자가 발급한 계정으로 로그인해주세요.
          </Typography>
        </Box>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <TextField 
            label="이메일" 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            fullWidth 
          />
          <TextField 
            label="비밀번호" 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            fullWidth 
          />
          <Button 
            type="submit" 
            variant="contained" 
            size="large"
            disabled={loading}
            sx={{ mt: 1, bgcolor: '#0284c7', fontWeight: 'bold' }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </Button>
        </form>
      </Paper>
    </Box>
  );
}