do $$
begin
  if to_regtype('public.commission_status') is not null
    and not exists (
      select 1
      from pg_enum
      where enumtypid = 'public.commission_status'::regtype
        and enumlabel = 'closed'
    )
  then
    alter type public.commission_status add value 'closed';
  end if;
end $$;
