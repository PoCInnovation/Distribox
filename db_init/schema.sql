CREATE TYPE vm_status AS ENUM ('running', 'stopped');

CREATE TABLE IF NOT EXISTS vms (
    id UUID PRIMARY KEY,
    os VARCHAR(255) NOT NULL,
    mem INT NOT NULL,
    mib INT NOT NULL,
    disk_size INT NOT NULL,
    status vm_status NOT NULL
);
