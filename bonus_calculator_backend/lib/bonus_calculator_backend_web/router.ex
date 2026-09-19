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

    resources "/employees", EmployeeController, except: [:new, :edit]
    resources "/shareholders", ShareholderController, except: [:new, :edit]

    resources "/employee_groups", EmployeeGroupController, except: [:new, :edit]
    post "/employee_groups/:id/members", EmployeeGroupController, :add_member
    delete "/employee_groups/:id/members/:employee_id", EmployeeGroupController, :remove_member

    resources "/distributions", DistributionController, except: [:new, :edit]
    post "/distributions/:id/finalize", DistributionController, :finalize
    post "/distributions/:id/mark_paid", DistributionController, :mark_paid
    get "/distributions/:id/computation", DistributionController, :computation

    post "/distributions/:id/groups", DistributionGroupController, :create
    patch "/distribution_groups/:id", DistributionGroupController, :update
    delete "/distribution_groups/:id", DistributionGroupController, :delete

    patch "/distribution_group_members/:id", DistributionGroupMemberController, :update

    post "/distributions/:id/special_bonuses", SpecialBonusController, :create
    delete "/special_bonuses/:id", SpecialBonusController, :delete
  end
end
