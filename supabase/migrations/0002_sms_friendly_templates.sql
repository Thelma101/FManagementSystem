-- Built-in welcome templates rewritten to fit one SMS page (under 160 plain characters).
update public.welcome_templates as t
set label = v.label, text = v.text
from (values
  ('w1', 'Harvest field welcome',
   'Dear {name}, it was a joy meeting you at {location}. God loves you and so do we! Come and worship with us at Living Faith Church.'),
  ('w2', 'New convert welcome',
   'Dear {name}, welcome to God''s family! Join us on Sunday at 7AM and at our WSF cell fellowship near you. God bless you! - Living Faith Church'),
  ('w3', 'Service invitation',
   'Dear {name}, thanks for your time at {location}. You are invited to our {service} at Living Faith Church. Come expecting a touch from God!')
) as v(id, label, text)
where t.id = v.id and t.built_in;
