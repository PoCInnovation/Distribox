from time import sleep
def wait_for_state(vm, state_code: int, timeout: float, retries:  int,):
    for _ in range(0, retries):
        code, _ = vm.state()
        if state_code == code:
            return code
        sleep(timeout)
    return code
