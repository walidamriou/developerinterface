/*
 * A simple Linux kernel module that logs messages when it is loaded and removed.
 *
 */
#include <linux/init.h>
#include <linux/kernel.h>
#include <linux/module.h>

// ----------------------------------------------------------------
// Module metadata
// This section provides information about the module, such as the 
// author, description, license, and version.
// ----------------------------------------------------------------
MODULE_AUTHOR("developer name here");
MODULE_DESCRIPTION("hello Linux kernel module");
MODULE_LICENSE("Dual MIT/GPL");
MODULE_VERSION("0.1");

// ----------------------------------------------------------------
// Module initialization function
// This function is called when the module is loaded into the kernel
// It logs a message to the kernel log and returns 0 to indicate 
// successful initialization
// ----------------------------------------------------------------
static int __init lkm_001_helloworld_init(void)
{
    pr_info("Hello, world\n"); // Log a message to the kernel log when the module is loaded
    return 0;
}

// ----------------------------------------------------------------
// Module cleanup function
// This function is called when the module is removed from the kernel
// It logs a message to the kernel log indicating that the module is 
// being removed
// ----------------------------------------------------------------
static void __exit lkm_001_helloworld_exit(void)
{
    pr_info("Goodbye, world\n");
}

// ----------------------------------------------------------------
// Module registration
// ----------------------------------------------------------------
// Register the initialization function to be called when the module is loaded
module_init(lkm_001_helloworld_init);
// Register the cleanup function to be called when the module is removed
module_exit(lkm_001_helloworld_exit);
