alias BonusCalculatorBackend.Accounts

case Accounts.get_user_by_username("rystraum@personal-it-y.com") do
  nil ->
    {:ok, _user} =
      Accounts.create_user(%{
        "username" => "rystraum@personal-it-y.com",
        "password" => "pass.123"
      })

  _user ->
    :ok
end
