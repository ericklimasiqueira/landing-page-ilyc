-- Read-only check of RLS flags and policy counts for this project.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.policyname) as policy_count
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
left join pg_policies as p
  on p.schemaname = n.nspname
 and p.tablename = c.relname
where c.relkind = 'r'
  and (
    (n.nspname = 'public' and c.relname in (
      'site_settings',
      'portfolio_projects',
      'portfolio_images',
      'process_steps',
      'faq_items'
    ))
    or (n.nspname = 'storage' and c.relname = 'objects')
  )
group by n.nspname, c.relname, c.relrowsecurity
order by n.nspname, c.relname;
