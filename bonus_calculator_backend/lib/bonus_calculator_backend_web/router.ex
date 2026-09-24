defmodule BonusCalculatorBackendWeb.Router do
  use BonusCalculatorBackendWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :api_auth do
    plug BonusCalculatorBackendWeb.Plugs.Authenticate
  end

  scope "/api", BonusCalculatorBackendWeb do
    pipe_through :api

    post "/session", SessionController, :create
  end

  scope "/api", BonusCalculatorBackendWeb do
    pipe_through [:api, :api_auth]

    delete "/session", SessionController, :delete

    patch "/user", UserController, :update
    get "/users", UserController, :index
    post "/users", UserController, :create

    resources "/employees", EmployeeController, except: [:new, :edit]
    resources "/shareholders", ShareholderController, except: [:new, :edit]

    resources "/employee_groups", EmployeeGroupController, except: [:new, :edit]
    post "/employee_groups/:id/members", EmployeeGroupController, :add_member
    delete "/employee_groups/:id/members/:employee_id", EmployeeGroupController, :remove_member

    resources "/distributions", DistributionController, except: [:new, :edit]
    post "/distributions/:id/finalize", DistributionController, :finalize
    post "/distributions/:id/mark_paid", DistributionController, :mark_paid
    get "/distributions/:id/computation", DistributionController, :computation

    get "/distributions/:id/suggestions", SuggestionController, :index
    post "/distributions/:id/suggestion", SuggestionController, :upsert
    post "/distributions/:id/simulate", SuggestionController, :simulate
    get "/suggestions/:id", SuggestionController, :show
    delete "/suggestions/:id", SuggestionController, :delete

    post "/distributions/:id/groups", DistributionGroupController, :create
    patch "/distribution_groups/:id", DistributionGroupController, :update
    delete "/distribution_groups/:id", DistributionGroupController, :delete

    patch "/distribution_group_members/:id", DistributionGroupMemberController, :update

    post "/distributions/:id/special_bonuses", SpecialBonusController, :create
    delete "/special_bonuses/:id", SpecialBonusController, :delete

    post "/seed_upload", SeedUploadController, :create
  end
end
