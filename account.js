/* Account storage uses Supabase Auth and database-enforced ownership. */
(async () => {
  const config = window.CLOUD_CONFIG;
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) return;
  const el = (id) => document.getElementById(id);
  const status = (message) => { el('accountStatus').textContent = message; };
  let client;
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
    client = createClient(config.supabaseUrl, config.supabasePublishableKey);
  } catch {
    status('Could not connect to accounts. Reload to retry. Browser templates are still available.');
    return;
  }
  let generation = 0;
  let busy = false;
  let recovery = false;
  const account = window.templateAccount = { user: null, templates: [] };
  const controls = ['saveTemplate', 'loadTemplate', 'deleteTemplate', 'refreshCloudTemplates', 'importLocalTemplates'];
  function lock(value) {
    busy = value;
    controls.forEach((id) => { el(id).disabled = value; });
    if (!value) refreshTemplates(el('savedTemplates').value);
  }
  async function operation(action) {
    if (busy || !account.user) return;
    const version = generation;
    const owner = account.user.id;
    lock(true);
    try { await action(owner, () => version === generation); }
    catch { if (version === generation) showStatus('Cloud operation failed. Your current schedule is unchanged. Check your connection and try again.'); }
    finally { if (version === generation) lock(false); }
  }
  async function fetchTemplates(owner, current, selected = '') {
    const { data, error } = await client.from('schedule_templates').select('name,data').eq('user_id', owner).order('name');
    if (error) throw error;
    data.forEach((entry) => validateTemplate(entry.data));
    if (!current()) return;
    account.templates = data;
    refreshTemplates(selected);
  }
  account.save = () => operation(async (owner, current) => {
    const name = el('templateName').value.trim();
    if (!name) { showStatus('Enter a template name before saving.'); return; }
    const data = validateTemplate(captureTemplate());
    const checkpoint = JSON.stringify(data);
    // Read the latest library before checking replacement, including changes from another computer.
    await fetchTemplates(owner, current);
    if (!current()) return;
    const existing = account.templates.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (existing && !window.confirm(`Replace the saved template "${existing.name}"?`)) return;
    const { error } = await client.from('schedule_templates').upsert({
      user_id: owner, name, name_key: name.toLowerCase(), data,
    }, { onConflict: 'user_id,name_key' });
    if (error) throw error;
    if (!current()) return;
    savedCheckpoint = checkpoint;
    showStatus(`Template "${name}" saved to your account.`);
    await fetchTemplates(owner, current, name);
  });
  account.load = () => operation(async (owner, current) => {
    const name = el('savedTemplates').value;
    const { data, error } = await client.from('schedule_templates').select('name,data').eq('user_id', owner).eq('name_key', name.toLowerCase()).maybeSingle();
    if (error) throw error;
    if (!current()) return;
    if (!data) { showStatus('This template no longer exists. Refresh the template list.'); return; }
    validateTemplate(data.data);
    if (!confirmTemplateReplacement()) return;
    applyTemplate(data.data);
    el('templateName').value = data.name;
    showStatus(`Template "${data.name}" loaded from your account.`);
  });
  account.remove = () => operation(async (owner, current) => {
    const name = el('savedTemplates').value;
    if (!name || !window.confirm(`Delete saved template "${name}" from your account?`)) return;
    const { error } = await client.from('schedule_templates').delete().eq('user_id', owner).eq('name_key', name.toLowerCase());
    if (error) throw error;
    if (!current()) return;
    await fetchTemplates(owner, current);
    showStatus('Saved template deleted from your account. The current schedule is still open.');
  });
  el('refreshCloudTemplates').onclick = () => operation(async (owner, current) => {
    await fetchTemplates(owner, current);
    if (current()) showStatus('Account templates refreshed.');
  });
  el('importLocalTemplates').onclick = () => operation(async (owner, current) => {
    const local = readTemplates();
    if (!local.length) { showStatus('No browser templates to import.'); return; }
    if (!window.confirm(`Copy ${local.length} browser templates into this account? Existing account templates with the same name will be kept.`)) return;
    const { error } = await client.from('schedule_templates').upsert(local.map(({ name, data }) => ({
      user_id: owner, name, name_key: name.toLowerCase(), data,
    })), { onConflict: 'user_id,name_key', ignoreDuplicates: true });
    if (error) throw error;
    if (!current()) return;
    await fetchTemplates(owner, current);
    showStatus('Browser templates copied to your account. Original browser copies are still available when signed out.');
  });
  async function authenticate(mode) {
    const form = el('accountForm');
    if (!form.reportValidity()) return;
    const email = el('accountEmail').value.trim();
    const password = el('accountPassword').value;
    const buttons = form.querySelectorAll('button');
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const result = recovery
        ? await client.auth.updateUser({ password })
        : mode === 'signup'
          ? await client.auth.signUp({ email, password })
          : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      el('accountPassword').value = '';
      if (recovery) { recovery = false; form.hidden = true; status('Password updated. You are signed in.'); }
      else if (mode === 'signup' && !result.data.session) status('Check your email to confirm your account, then sign in.');
    } catch (error) { status(error.message || 'Unable to sign in. Please try again.'); }
    finally { buttons.forEach((button) => { button.disabled = false; }); }
  }
  el('accountForm').onsubmit = (event) => { event.preventDefault(); authenticate('signin'); };
  el('createAccount').onclick = () => authenticate('signup');
  el('resetPassword').onclick = async () => {
    if (!el('accountEmail').reportValidity() || !el('accountEmail').value.trim()) return;
    const { error } = await client.auth.resetPasswordForEmail(el('accountEmail').value.trim(), { redirectTo: window.location.origin });
    status(error ? 'Could not send a reset email. Please try again.' : 'If this account exists, a password reset link will arrive by email.');
  };
  el('signOut').onclick = async () => {
    if (busy || !confirmTemplateReplacement()) return;
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) status('Could not sign out. Please try again.');
  };
  client.auth.onAuthStateChange((event, session) => {
    // Defer database calls until the auth callback has released its lock.
    if (event === 'PASSWORD_RECOVERY') recovery = true;
    const user = session?.user ?? null;
    if (user?.id === account.user?.id && event !== 'INITIAL_SESSION' && !recovery) return;
    const previousUser = account.user;
    generation++;
    account.user = user;
    account.templates = [];
    if (previousUser && previousUser.id !== user?.id) {
      applyTemplate(BLANK_TEMPLATE);
      el('templateName').value = '';
      showStatus('Signed out. The previous account schedule has been cleared from the editor.');
    }
    el('accountForm').hidden = !!user && !recovery;
    el('accountActions').hidden = !user;
    el('accountPassword').value = '';
    if (recovery) {
      el('accountEmail').value = user?.email || '';
      status('Enter a new password and select Sign in to finish resetting your password.');
    } else status(user ? `Signed in as ${user.email}` : 'Sign in to access your templates on any computer.');
    el('templateStorageNote').textContent = user
      ? 'Saved privately to your account. Sign in on another computer and choose Load. Save again after making changes.'
      : 'Your current schedule is saved automatically in this browser and restored when you return. Use Save template to keep named versions.';
    lock(false);
    if (user) setTimeout(() => { if (account.user?.id === user.id) el('refreshCloudTemplates').click(); }, 0);
  });
})();
