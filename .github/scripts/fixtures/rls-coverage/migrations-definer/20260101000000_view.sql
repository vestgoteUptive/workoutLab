-- T-0402c AC-2 planted fault: the view is created invoker, then switched to definer rights.
create view public.session_sets_live with (security_invoker = true) as select 1 as x;
alter view public.session_sets_live set (security_invoker = false);
