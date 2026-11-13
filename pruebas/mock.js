// Supabase falso en memoria (persistido en localStorage) para probar la página
(function(){
  const K = "__mocksb";
  const load = () => JSON.parse(localStorage.getItem(K) || '{"t":{"liga":[],"historial":[],"vinculos":[],"votos":[],"inscripciones":[],"perfiles":[]},"users":[],"session":null,"admins":[]}');
  let st = load();
  const save = () => localStorage.setItem(K, JSON.stringify(st));
  window.__mock = {get st(){ return st; }, set(fn){ fn(st); save(); }, log:[]};
  const keyOf = {liga:"id", historial:"id", vinculos:"user_id", votos:"user_id", inscripciones:"user_id", perfiles:"id", contactos:"id", sanciones:"id", perfil_publico:"user_id", jueces:"user_id"};
  function q(t){
    let filters = [], op = "select", payload = null, single = false;
    const b = {
      select(){ return b; }, order(){ return b; }, limit(){ return b; }, gt(){ return b; }, gte(){ return b; }, lt(){ return b; }, neq(){ return b; }, single(){ single = true; return b; }, insert(row){ op = "upsert"; payload = row; return b; }, update(row){ op = "upsert"; payload = row; return b; }, eq(c, v){ filters.push(r => String(r[c]) === String(v)); return b; },
      in(c, vs){ filters.push(r => vs.includes(r[c])); return b; },
      maybeSingle(){ single = true; return b; },
      upsert(row){ op = "upsert"; payload = row; return b; },
      delete(){ op = "delete"; return b; },
      then(res, rej){
        window.__mock.log.push(op + " " + t);
        const rows = st.t[t] = st.t[t] || [];
        let out = {data:null, error:null};
        if (op === "select"){ let d = rows.filter(r => filters.every(f => f(r))); out.data = single ? (d[0] || null) : d; }
        else if (op === "upsert"){
          if ((t === "liga" || t === "historial") && !st.admins.includes(st.session && st.session.user.id)) out.error = {message:"new row violates row-level security policy"};
          else { const k = keyOf[t]; const i = rows.findIndex(r => r[k] === payload[k]); if (i >= 0) rows[i] = Object.assign({}, rows[i], payload); else rows.push(payload); save(); }
        } else { st.t[t] = rows.filter(r => !filters.every(f => f(r))); save(); }
        return Promise.resolve(out).then(res, rej);
      }
    };
    return b;
  }
  const authCbs = [];
  const auth = {
    async getUser(){ return {data:{user: st.session ? st.session.user : null}, error:null}; },
    async signInWithOAuth(){ return {data:{}, error:null}; },
    async getSession(){ return {data:{session:st.session}}; },
    onAuthStateChange(cb){ authCbs.push(cb); return {data:{subscription:{unsubscribe(){}}}}; },
    async signUp({email, password, options}){
      if (st.users.find(u => u.email === email)) return {data:{}, error:null};
      const u = {id:"uid-" + (st.users.length + 1), email, password, confirmed:false, meta:options.data};
      st.users.push(u); save(); window.__mock.log.push("signup " + email); return {data:{user:u}, error:null};
    },
    async resend(){ window.__mock.log.push("resend"); return {error:null}; },
    async resetPasswordForEmail(e){ window.__mock.log.push("reset " + e); return {error:null}; },
    async verifyOtp({email, token, type}){
      window.__mock.log.push("verify " + type + " " + token);
      const u = st.users.find(x => x.email === email);
      if (!u || token !== "123456") return {error:{code:"otp_expired", message:"Token has expired or is invalid"}};
      if (type === "signup") return {error:{code:"otp_expired", message:"Token has expired or is invalid"}};
      if (!u.confirmed){ u.confirmed = true; st.t.perfiles.push({id:u.id, nombre:u.meta.nombre, apellido:u.meta.apellido, apodo:u.meta.apodo}); }
      st.session = {user:{id:u.id, email:u.email}}; save(); return {data:{session:st.session}, error:null};
    },
    async signInWithPassword({email, password}){
      const u = st.users.find(x => x.email === email);
      if (!u || u.password !== password) return {error:{code:"invalid_credentials", message:"Invalid login credentials"}};
      if (!u.confirmed) return {error:{code:"email_not_confirmed", message:"Email not confirmed"}};
      st.session = {user:{id:u.id, email:u.email}}; save(); return {error:null};
    },
    async updateUser({password}){ const u = st.users.find(x => x.id === st.session.user.id); u.password = password; save(); return {error:null}; },
    async signOut(){ st.session = null; save(); return {error:null}; }
  };
  window.supabase = {createClient(){ return {
    auth, from: q,
    channel(){ const ch = {on(){ return ch; }, subscribe(cb){ if (typeof cb === "function") setTimeout(() => cb("SUBSCRIBED"), 0); return ch; }, unsubscribe(){}}; return ch; }, removeChannel(){},
    rpc: async n => ({data: !!(st.session && st.admins.includes(st.session.user.id)), error:null}),
    channel(){ const c = {on(){ return c; }, subscribe(){ return c; }}; return c; }
  }; }};
})();
