-- PATCH 2 : employees may read the payment (UPI) settings; run once in SQL Editor
drop policy if exists set_sel on settings;
create policy set_sel on settings for select using(
  is_admin() or (key in('doc_checklist','payment_config') and is_active_user()));
