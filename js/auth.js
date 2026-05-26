function requireAuth() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(user => {
      if (user) resolve(user);
      else window.location.href = 'login.html';
    });
  });
}
