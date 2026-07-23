#include "GenericPlatform/GenericPlatformHttp.h"
#include "HAL/PlatformProcess.h"
#include "Misc/App.h"
#include "Misc/Paths.h"
#include "Modules/ModuleManager.h"

class FRepoPuckEditorModule final : public IModuleInterface
{
public:
    virtual void StartupModule() override
    {
        if (IsRunningCommandlet() || FApp::IsUnattended())
        {
            return;
        }

        const FString ProjectDirectory =
            FPaths::ConvertRelativePathToFull(FPaths::ProjectDir());
        if (ProjectDirectory.IsEmpty())
        {
            return;
        }

        const FString Uri = FString::Printf(
            TEXT("repopuck://open?path=%s"),
            *FGenericPlatformHttp::UrlEncode(ProjectDirectory)
        );
        FPlatformProcess::LaunchURL(*Uri, nullptr, nullptr);
    }
};

IMPLEMENT_MODULE(FRepoPuckEditorModule, RepoPuckEditor)
