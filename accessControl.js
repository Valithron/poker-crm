export const whitelist = [
  "adam@adamdoliver.com",
  "juliantheoliver@gmail.com",
  "nathansleeger@gmail.com",
  "ryanwall.biz@gmail.com",
  "valturg@gmail.com",
];

export async function enforceWhitelist(auth, user) {
  if (!user || !whitelist.includes(user.email)) {
    const { signOut } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"
    );
    await signOut(auth);
    alert("Access denied: Not an approved user.");
    window.location.href = "login.html";
    return false;
  }
  return true;
}
