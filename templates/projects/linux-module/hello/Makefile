# Makefile for building the hello kernel module
# This Makefile uses the kernel build system to compile the kernel module
# It defines the module name and specifies the kernel build directory
obj-m += hello.o # Specify the name of the kernel module to be built

KDIR ?= /lib/modules/$(shell uname -r)/build # Set the kernel build directory, defaulting to the current kernel's build directory
PWD  := $(shell pwd) # Get the current working directory, which is where the kernel module source code is located

# Fail fast with an actionable message when the kernel build tree is missing.
ifeq ($(wildcard $(KDIR)/Makefile),)
$(error Kernel build directory '$(KDIR)' was not found. Install headers for kernel '$(shell uname -r)' or run: make KDIR=/path/to/kernel/build)
endif

# Define the default target for building the kernel module
all: # Build the kernel module by invoking the kernel build system
	$(MAKE) -C $(KDIR) M=$(PWD) modules

clean: # Clean the build artifacts by invoking the kernel build system's clean target
	$(MAKE) -C $(KDIR) M=$(PWD) clean
