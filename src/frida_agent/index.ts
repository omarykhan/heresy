rpc.exports = {
  init(stage, params) {
    // console.log(JSON.stringify(params));
    if (!params.package_name) {
      console.error('package_name is required');
      return;
    }

    const package_name = params.package_name;
    const _before = params.hermes_before || '';
    const _main = params.hermes_hook || '';

    if (Java.available) {
      Java.perform(() => {
        const waitForClass = (className: string, callback: any) => {
          const interval = setInterval(() => {
            try {
              Java.use(className);
              clearInterval(interval);
              callback();
            } catch (e) {
              // Class not yet available, keep waiting
            }
          }, 10);
        };


        const hookJS = () => {
          try {
            // Write the script files to the device filesystem where the app can access it
            const before = new File(`/data/data/${package_name}/files/hermes-before-hook.js`, 'w');
            before.write(_before);
            before.close();

            const after = new File(`/data/data/${package_name}/files/hermes-hook.js`, 'w');
            after.write(_main);
            after.close();

            const func = Java.use('com.facebook.react.bridge.CatalystInstanceImpl').loadScriptFromAssets;

            func.implementation = function (assetManager: any, assetURL: string, z: boolean) {
              // Store for later I guess

              // Load up the script that will be executed before the RN bundle is loaded and executes
              this.loadScriptFromFile(`/data/data/${package_name}/files/hermes-before-hook.js`, `/data/data/${package_name}/files/hermes-before-hook.js`, z);
              console.log('[*] hermes_before was loaded!');

              // Load the actual RN bundle
              this.loadScriptFromAssets(assetManager, assetURL, z);

              // Load up the script that will be executed after the RN bundle is loaded and starts executing
              this.loadScriptFromFile(`/data/data/${package_name}/files/hermes-hook.js`, `/data/data/${package_name}/files/hermes-hook.js`, z);
              console.log('[*] hermes_hook was loaded!');
              send({ type: 'hermes_hook_loaded' });
            };
          } catch (e) {
            console.error(e);
          }
        };

        // We have to wait for SoLoader.init to be called before we can hook into the JS runtime.
        // There's a few overloads, so we have to hook into all of them and then call our hookJS function.
        waitForClass('com.facebook.soloader.SoLoader', () => {
          let SoLoader = Java.use('com.facebook.soloader.SoLoader');
          SoLoader.init.overload('android.content.Context', 'int').implementation = function (context: any, i: any) {
            this.init(context, i);
            hookJS();
          };
  
          SoLoader.init.overload('android.content.Context', 'int', 'com.facebook.soloader.SoFileLoader').implementation = function (context: any, i: any, soFileLoader: any) {
            this.init(context, i, soFileLoader);
            hookJS();
          };
  
          SoLoader.init.overload('android.content.Context', 'int', 'com.facebook.soloader.SoFileLoader', '[Ljava.lang.String;').implementation = function (context: any, i: any, soFileLoader: any, strArr: any) {
            this.init(context, i, soFileLoader, strArr);
            hookJS();
          };
  
          SoLoader.init.overload('android.content.Context', 'boolean').implementation = function (context: any, z: any) {
            this.init(context, z);
            hookJS();
          };
        });
      });
    } else if (ObjC.available) {

      enum NSSearchPaths {
          NSApplicationDirectory = 1,
          NSDemoApplicationDirectory,
          NSDeveloperApplicationDirectory,
          NSAdminApplicationDirectory,
          NSLibraryDirectory,
          NSDeveloperDirectory,
          NSUserDirectory,
          NSDocumentationDirectory,
          NSDocumentDirectory,
          NSCoreServiceDirectory,
          NSAutosavedInformationDirectory,
          NSDesktopDirectory,
          NSCachesDirectory,
          NSApplicationSupportDirectory,
      }
  
      const NSUserDomainMask = 1
  
      const getNSFileManager = () => {
          const NSFM = ObjC.classes.NSFileManager
          return NSFM.defaultManager()
      }
  
      // small helper function to lookup ios bundle paths
      const getPathForNSLocation = (NSPath: NSSearchPaths): string => {
          const p = getNSFileManager().URLsForDirectory_inDomains_(NSPath, NSUserDomainMask).lastObject()
  
          if (p) {
              return p.path().toString()
          }
  
          return ""
      }
  
      let documentDirectory: string
  
      const hookJS = () => {
  
          try {
  
              const beforePath = `${documentDirectory}/hermes-before-hook.js`
  
              const afterPath = `${documentDirectory}/hermes-hook.js`
  
              // Write the script files to the device filesystem where the app can access it
              const beforeFile = new File(beforePath, 'w')
  
              beforeFile.write(_before)
  
              beforeFile.close()
  
              const afterFile = new File(afterPath, 'w')
  
              afterFile.write(_main)
  
              afterFile.close()
  
              const objClasses = ObjC["classes"]
  
              const nsUrlClass = objClasses["NSURL"]
  
              const beforeScriptUrl = nsUrlClass["+ URLWithString:"](`file://${beforePath}`)
  
              const afterScriptUrl = nsUrlClass["+ URLWithString:"](`file://${afterPath}`)
  
              const nsDataClass = objClasses["NSData"]
  
              const beforeScriptData = nsDataClass["+ dataWithContentsOfURL:"](beforeScriptUrl)
  
              const afterScriptData = nsDataClass["+ dataWithContentsOfURL:"](afterScriptUrl)
  
              const reactBridgeClass = objClasses["RCTCxxBridge"]
  
              const executeApplicationScriptMethod = reactBridgeClass["- executeApplicationScript:url:async:"]
  
              const originalExecuteApplicationScript = executeApplicationScriptMethod.implementation
  
              executeApplicationScriptMethod.implementation = ObjC.implement(
  
                  executeApplicationScriptMethod,
                  (handle, selector, scriptData, scriptUrl, asyncFlag) => {
  
                      // Load up the script that will be executed before the RN bundle is loaded and executes
                      originalExecuteApplicationScript(
                          handle,
                          selector,
                          beforeScriptData,
                          beforeScriptUrl,
                          asyncFlag,
                      )
  
                      // Load the actual RN bundle
                      const originalBundleLoadResult = originalExecuteApplicationScript(
                          handle,
                          selector,
                          scriptData,
                          scriptUrl,
                          asyncFlag,
                      )
  
                      // Load up the script that will be executed after the RN bundle is loaded and starts executing
                      originalExecuteApplicationScript(
                          handle,
                          selector,
                          afterScriptData,
                          afterScriptUrl,
                          asyncFlag,
                      )
  
                      console.log('[*] hermes_hook was loaded!')
  
                      send({ type: 'hermes_hook_loaded' })
  
                      return originalBundleLoadResult
                  }
              )
  
          } catch (e) {
  
              console.error(e)
          }
      }
  
      const waitForAppDocuments = () => {
  
          const interval = setInterval(() => {
  
              try {
  
                  documentDirectory = getPathForNSLocation(NSSearchPaths.NSDocumentDirectory)
  
                  hookJS()
  
                  clearInterval(interval)
  
              } catch (e) {
                  // App not yet available, keep waiting
              }
          }, 10)
      }
  
      waitForAppDocuments()
    }
  }
};