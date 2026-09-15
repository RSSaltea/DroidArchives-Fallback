(async function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  let client, user = null, sending = false, submitted = false, requestId = null;
  let questions = [];
  const status = (selector, text) => { $(selector).textContent = text; };
  const roleShows = q => !q.moderatorOnly || ['moderator', 'either'].includes($('#role').value);
  function updateQuestions() {
    for (const q of questions) {
      const input = document.getElementById(q.id), visible = roleShows(q);
      input.closest('.question').hidden = !visible;
      input.disabled = !visible;
      input.required = visible && q.required;
    }
  }
  function setSession(session) {
    const next = session?.user || null;
    if (user?.id !== next?.id) {
      $('#application-form').reset(); requestId = null; submitted = false;
      $('#submit-application').textContent = 'Send application';
      for (const q of questions) document.getElementById(q.id).nextElementSibling.textContent = '0 / 600';
      status('#application-status', ''); status('#application-error', ''); updateQuestions();
    }
    user = next;
    $('#login-form').hidden = Boolean(user);
    $('#signout').hidden = !user;
    $('#application-fields').disabled = !user || sending || submitted;
    status('#account-status', user ? `Signed in as ${user.email || 'your Droid Archives account'}.` : 'Sign in to send your application.');
  }
  try {
    const [configResponse, questionsResponse] = await Promise.all([fetch('../data/supabase-config.json'), fetch('questions.json')]);
    if (!configResponse.ok || !questionsResponse.ok) throw Error('The application form could not load. Please refresh and try again.');
    const config = await configResponse.json(); questions = await questionsResponse.json();
    for (const q of questions) {
      const section = document.createElement('div'); section.className = 'question';
      const label = document.createElement('label'); label.htmlFor = q.id; label.textContent = q.label + (q.required ? '' : ' (optional)');
      const hint = document.createElement('p'); hint.className = 'hint'; hint.id = `${q.id}-hint`; hint.textContent = q.hint;
      const input = document.createElement('textarea'); input.id = q.id; input.name = q.id; input.maxLength = 600; input.minLength = q.required ? 10 : 0; input.setAttribute('aria-describedby', hint.id);
      const count = document.createElement('small'); count.textContent = '0 / 600';
      input.addEventListener('input', () => { count.textContent = `${input.value.length} / 600`; });
      section.append(label, hint, input, count); $('#questions').append(section);
    }
    updateQuestions(); $('#role').addEventListener('change', updateQuestions);
    client = window.supabase.createClient(config.url, config.anonKey || config.anon_key);
    client.auth.onAuthStateChange((_event, session) => setSession(session));
    const {data, error} = await client.auth.getSession(); if (error) throw error;
    setSession(data.session);
  } catch (error) { status('#login-error', error.message); status('#account-status', 'Sign-in is temporarily unavailable.'); return; }

  async function login(create = false) {
    const form = $('#login-form'); if (!form.reportValidity()) return;
    status('#login-error', ''); $('#login-submit').disabled = $('#signup').disabled = true;
    try {
      const email = form.elements.email.value.trim(), password = form.elements.password.value;
      const result = create ? await client.auth.signUp({email, password, options:{emailRedirectTo:new URL('../', location.href).href}}) : await client.auth.signInWithPassword({email, password});
      if (result.error) throw result.error;
      form.elements.password.value = '';
      if (create && !result.data.session) status('#account-status', 'Check your email to confirm your account, then return here and sign in.');
      else setSession(result.data.session);
    } catch (error) { status('#login-error', error.message); }
    finally { $('#login-submit').disabled = $('#signup').disabled = false; }
  }
  $('#login-form').addEventListener('submit', event => { event.preventDefault(); login(); });
  $('#signup').addEventListener('click', () => login(true));
  $('#signout').addEventListener('click', async () => {
    const {error} = await client.auth.signOut(); if (error) status('#login-error', error.message);
  });
  $('#application-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!user || sending || submitted || !event.target.reportValidity()) return;
    const application = {
      role: $('#role').value,
      discord_username: event.target.elements.discord_username.value.trim(),
      discord_id: event.target.elements.discord_id.value.trim(),
      consent: event.target.elements.consent.checked,
      answers: Object.fromEntries(questions.filter(roleShows).map(q => [q.id, document.getElementById(q.id).value.trim()]))
    };
    const empty = questions.find(q => roleShows(q) && q.required && application.answers[q.id].length < 10);
    if (empty) { status('#application-error', `Please add a little more detail: ${empty.label}`); document.getElementById(empty.id).focus(); return; }
    // Reuse the ID after a timeout: the database returns the original receipt
    // if the first request was saved but its response did not reach the browser.
    requestId ||= crypto.randomUUID();
    const submittingUser = user.id;
    sending = true; $('#application-fields').disabled = true; $('#signout').disabled = true;
    $('#submit-application').textContent = 'Sending…'; status('#application-error', '');
    try {
      const {data, error} = await client.rpc('submit_droid_staff_application', {request_id:requestId, application});
      if (user?.id !== submittingUser) return;
      if (error) throw error;
      if (!data?.id) throw Error('No receipt was returned. Please retry.');
      submitted = true;
      status('#application-status', `Application received. It is queued for the Droid Archives staff review channel. The team can contact you on Discord. Reference: ${data.id}`);
      $('#application-status').focus();
    } catch (error) {
      if (user?.id !== submittingUser) return;
      const message = error.message || 'Please try again.';
      status('#application-error', /function|schema cache|permission denied/i.test(message) ? 'Applications are not open yet. Please try again later.' : `Your application could not be confirmed. ${message}`);
      $('#application-error').focus();
    } finally {
      sending = false; $('#application-fields').disabled = !user || submitted; $('#signout').disabled = false;
      $('#submit-application').textContent = submitted ? 'Application sent' : 'Send application';
    }
  });
})();
