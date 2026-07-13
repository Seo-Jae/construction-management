import React, { useState } from 'react';
import { Avatar, Button, CssBaseline, TextField, FormControlLabel, Checkbox, Link, Paper, Box, Grid, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Dashboard from './Dashboard'; // 👈 로그인 성공 시 보여줄 대시보드 불러오기!

export default function App() {
  // 사용자가 로그인했는지 여부를 기억하는 스위치 (false = 로그인 안 됨, true = 로그인 됨)
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');

  // 로그인 버튼을 눌렀을 때 실행되는 함수
  const handleLogin = (e) => {
    e.preventDefault();
    
    // 💡 지금은 테스트를 위해 아이디에 'admin', 비밀번호에 '1234'를 치면 통과되게 만들었습니다.
    // (나중에 데이터베이스의 사용자 정보와 비교하도록 고칠 예정입니다!)
    if (id === 'admin' && password === '1234') {
      setIsLoggedIn(true); // 스위치를 켜서 대시보드로 화면 전환!
    } else {
      alert('아이디 또는 비밀번호가 틀렸습니다. (테스트용 ID: admin / PW: 1234)');
    }
  };

  // 1. 스위치가 켜졌다면(true), 로그인 화면 대신 대시보드 화면을 보여줍니다!
  if (isLoggedIn) {
    return <Dashboard />;
  }

  // 2. 스위치가 꺼져있다면(false), 원래의 로그인 화면을 보여줍니다.
  return (
    <Grid container component="main" sx={{ height: '100vh' }}>
      <CssBaseline />
      
      <Grid
        item
        xs={false}
        sm={4}
        md={7}
        sx={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1541888081640-5ad5730a6671?q=80&w=2000&auto=format&fit=crop)',
          backgroundRepeat: 'no-repeat',
          backgroundColor: (t) => t.palette.mode === 'light' ? t.palette.grey[50] : t.palette.grey[900],
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      <Grid item xs={12} sm={8} md={5} component={Paper} elevation={6} square>
        <Box sx={{ my: 8, mx: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          <Avatar sx={{ m: 1, bgcolor: 'primary.main' }}>
            <LockOutlinedIcon />
          </Avatar>
          
          <Typography component="h1" variant="h5" sx={{ fontWeight: 'bold', mb: 2 }}>
            🏗️ 스마트 공사 관리 시스템
          </Typography>
          
          <Box component="form" onSubmit={handleLogin} noValidate sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="id"
              label="아이디 (테스트: admin)"
              name="id"
              autoFocus
              value={id}
              onChange={(e) => setId(e.target.value)} // 사용자가 치는 글자를 실시간으로 기억
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="비밀번호 (테스트: 1234)"
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)} // 사용자가 치는 글자를 실시간으로 기억
            />
            <FormControlLabel
              control={<Checkbox value="remember" color="primary" />}
              label="아이디 저장"
            />
            <Button
              type="submit" // 👈 엔터를 치거나 클릭하면 handleLogin이 실행되도록 submit으로 변경
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2, py: 1.5, fontSize: '16px', fontWeight: 'bold' }}
            >
              로그인
            </Button>
            <Grid container>
              <Grid item xs>
                <Link href="#" variant="body2">비밀번호 초기화</Link>
              </Grid>
              <Grid item>
                <Link href="#" variant="body2">신규 현장 등록</Link>
              </Grid>
            </Grid>
          </Box>

        </Box>
      </Grid>
    </Grid>
  );
}