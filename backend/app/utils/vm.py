import libvirt
from time import sleep
def wait_for_state(vm, state_code: int, timeout: float, retries:  int,):
    for _ in range(0, retries):
        code, _ = vm.state()
        print('state', code)
        if state_code == code:
            return code
        sleep(timeout)
    print('failed to wait for state')
    return code
