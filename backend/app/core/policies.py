from collections.abc import Iterable

# When this changes, please update the frontend as well here
# frontend/app/lib/types/policies.ts
DISTRIBOX_ADMIN_POLICY = "distribox:admin"

POLICIES: list[dict[str, str]] = [
    {
        "policy": DISTRIBOX_ADMIN_POLICY,
        "description": "This policy gives full access to the Distribox dashboard application.",
    },
    {
        "policy": "auth:me:get",
        "description": "Allows a user to fetch their own authenticated profile.",
    },
    {
        "policy": "auth:changePassword",
        "description": "Allows a user to change their own password.",
    },
    {
        "policy": "host:get",
        "description": "Allows the user to fetch the host resources.",
    },
    {
        "policy": "images:get",
        "description": "Allows the user to fetch images metadata from the registry.",
    },
    {
        "policy": "policies:get",
        "description": "Allows the user to fetch policies.",
    },
    {
        "policy": "users:get",
        "description": "Allows the user to fetch users.",
    },
    {
        "policy": "users:create",
        "description": "Allows the user to create users.",
    },
    {
        "policy": "users:updatePolicies",
        "description": "Allows the user to update user policies.",
    },
    {
        "policy": "users:delete",
        "description": "Allows the user to delete users.",
    },
    {
        "policy": "users:getPassword",
        "description": "Allows the user to fetch user passwords.",
    },
    {
        "policy": "vms:get",
        "description": "Allows the user to list virtual machines.",
    },
    {
        "policy": "vms:getById",
        "description": "Allows the user to fetch a virtual machine by id.",
    },
    {
        "policy": "vms:create",
        "description": "Allows the user to create virtual machines.",
    },
    {
        "policy": "vms:start",
        "description": "Allows the user to start virtual machines.",
    },
    {
        "policy": "vms:stop",
        "description": "Allows the user to stop virtual machines.",
    },
    {
        "policy": "vms:connect",
        "description": "Allows the user to connect to a virtual machine via the dashboard tunnel.",
    },
    {
        "policy": "vms:credentials:create",
        "description": "Allows the user to create virtual machine credentials.",
    },
    {
        "policy": "vms:delete",
        "description": "Allows the user to remove virtual machines.",
    },
    {
        "policy": "vms:screenshot",
        "description": "Allows the user to make virtual machine screenshots.",
    },
    {
        "policy": "vms:duplicate",
        "description": "Allows the user to duplicate a virtual machine.",
    },
    {
        "policy": "vms:credentials:revoke",
        "description": "Allows the user to revoke virtual machine credentials.",
    },
    {
        "policy": "vms:credentials:list",
        "description": "Allows the user to list virtual machine credentials.",
    },
    {
        "policy": "vms:credentials:getById",
        "description": "Allows the user to fetch a virtual machine credential by id.",
    },
    {
        "policy": "vms:cleanRecoverableVmById",
        "description": "Allows the user clean a recoverable vm by id.",
    },
    {
        "policy": "vms:cleanAllRecoverableVms",
        "description": "Allows the user to clean all recoverable vms by id.",
    },
    {
        "policy": "vms:getRecoverableVms",
        "description": "Allows the user to get all recoverable vms.",
    },
    {
        "policy": "vms:recoverVmById",
        "description": "Allows the user to recover a vm by id.",
    },
    {
        "policy": "events:get",
        "description": "Allows the user to list events.",
    },
    {
        "policy": "events:getById",
        "description": "Allows the user to fetch an event by id.",
    },
    {
        "policy": "events:create",
        "description": "Allows the user to create events.",
    },
    {
        "policy": "events:update",
        "description": "Allows the user to update events.",
    },
    {
        "policy": "events:delete",
        "description": "Allows the user to delete events and their VMs.",
    },
]

VALID_POLICIES = {entry["policy"] for entry in POLICIES}
POLICY_BY_NAME = {entry["policy"]: entry for entry in POLICIES}


def normalize_policies(policies: Iterable[str]) -> list[str]:
    """Deduplicate while preserving first-seen order."""
    normalized: list[str] = []
    seen: set[str] = set()

    for policy in policies:
        if policy not in seen:
            normalized.append(policy)
            seen.add(policy)

    return normalized


def invalid_policies(policies: Iterable[str]) -> list[str]:
    return [policy for policy in policies if policy not in VALID_POLICIES]


def expand_policies(policies: Iterable[str]) -> list[dict[str, str]]:
    expanded: list[dict[str, str]] = []
    for policy in policies:
        policy_entry = POLICY_BY_NAME.get(policy)
        if policy_entry is not None:
            expanded.append(policy_entry)
        else:
            expanded.append(
                {
                    "policy": policy,
                    "description": "Custom policy",
                }
            )
    return expanded
