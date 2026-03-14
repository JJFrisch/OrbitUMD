alter table public.programs
  add column if not exists requirement_tree jsonb;

alter table public.requirement_blocks
  add column if not exists source_node_id text;

create index if not exists idx_requirement_blocks_program_source_node
  on public.requirement_blocks(program_id, source_node_id);